/**
 * Treasury controls.
 *
 * The money path enforced nothing. createAllocation accepted any proposal id,
 * including one that never existed; checkSpendingLimit had no caller on that path
 * at all, so configured limits constrained nobody; and disburseAllocation wrote an
 * authoritative 'disbursed' allocation plus a 'confirmed' transaction from a
 * caller-supplied hash it never verified — a settled payment, publicly listed,
 * that may never have happened.
 *
 * Two supporting defects made the limits decorative even where they were checked:
 * every setSpendingLimit minted a fresh id so INSERT OR REPLACE only ever appended
 * (the read kept returning the oldest row, making a tightened limit a no-op), and
 * the spend total was computed with SUM(CAST(amount AS INTEGER)), which raises
 * "integer overflow" past 2^63-1 wei — 9.223 tokens at 18 decimals.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

import { createSchema } from '../../db';
import { AuditService } from '../audit';
import { TreasuryService } from './treasury';

const TOKEN = '0x0000000000000000000000000000000000000000'; // ETH, always supported
const ONE = 10n ** 18n;

function build(): {
  db: Database.Database;
  treasury: TreasuryService;
  audit: AuditService;
} {
  const db = new Database(':memory:');
  createSchema(db);
  const io = new SocketServer(createServer());
  const treasury = new TreasuryService(db, io, {
    treasuryAddress: '0x000000000000000000000000000000000000dead',
  });
  const audit = new AuditService(db);
  treasury.setAuditService(audit);
  return { db, treasury, audit };
}

function seedProposal(db: Database.Database, id: string, status: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO proposals (id, title, description, proposer, status, created_at, updated_at)
     VALUES (?, ?, 'desc', 'seed', ?, ?, ?)`
  ).run(id, `Proposal ${id}`, status, now, now);
}

function allocate(
  treasury: TreasuryService,
  proposalId: string,
  amount: string
) {
  return treasury.createAllocation(proposalId, {
    category: 'grants',
    tokenAddress: TOKEN,
    amount,
    recipient: '0x000000000000000000000000000000000000beef',
  });
}

describe('createAllocation', () => {
  let db: Database.Database;
  let treasury: TreasuryService;

  beforeEach(() => {
    ({ db, treasury } = build());
  });

  it('refuses a proposal id that does not exist', () => {
    expect(() =>
      allocate(treasury, 'no-such-proposal', ONE.toString())
    ).toThrow(/Unknown proposal/);
    expect(
      db.prepare('SELECT COUNT(*) as n FROM budget_allocations').get()
    ).toEqual({ n: 0 });
  });

  it('accepts an allocation against a real proposal', () => {
    seedProposal(db, 'p1', 'discussion');

    const allocation = allocate(treasury, 'p1', ONE.toString());

    expect(allocation.status).toBe('pending');
    expect(allocation.proposalId).toBe('p1');
  });

  it('rejects an amount that is not a wei-scale integer', () => {
    seedProposal(db, 'p1', 'discussion');

    expect(() => allocate(treasury, 'p1', '1.5')).toThrow(/Invalid amount/);
  });

  it('refuses an allocation over the configured limit', () => {
    seedProposal(db, 'p1', 'passed');
    treasury.setSpendingLimit('grants', TOKEN, { dailyLimit: ONE.toString() });

    expect(() => allocate(treasury, 'p1', (2n * ONE).toString())).toThrow(
      /Spending limit exceeded/
    );
  });

  it('records a breached limit in the audit chain', () => {
    const { db: db2, treasury: t2, audit } = build();
    seedProposal(db2, 'p1', 'passed');
    t2.setSpendingLimit('grants', TOKEN, { dailyLimit: ONE.toString() });

    expect(() => allocate(t2, 'p1', (2n * ONE).toString())).toThrow();

    expect(audit.recent().map(e => e.type)).toContain('BUDGET_EXCEEDED');
  });
});

describe('disburseAllocation', () => {
  let db: Database.Database;
  let treasury: TreasuryService;
  let audit: AuditService;

  beforeEach(() => {
    ({ db, treasury, audit } = build());
  });

  async function approved(proposalStatus: string) {
    seedProposal(db, 'p1', proposalStatus);
    const allocation = allocate(treasury, 'p1', ONE.toString());
    treasury.approveAllocation(allocation.id);
    return allocation.id;
  }

  it('refuses to disburse against a proposal that has not passed', async () => {
    const id = await approved('discussion');

    await expect(treasury.disburseAllocation(id, '0xhash')).rejects.toThrow(
      /not passed/
    );
    expect(treasury.getAllocation(id)!.status).toBe('approved');
  });

  it('refuses to disburse without a transaction hash', async () => {
    const id = await approved('passed');

    await expect(treasury.disburseAllocation(id)).rejects.toThrow(
      /transaction hash is required/
    );
    expect(treasury.getAllocation(id)!.status).toBe('approved');
  });

  it('disburses against a passed proposal with a hash', async () => {
    const id = await approved('passed');

    const updated = await treasury.disburseAllocation(id, '0xhash');

    expect(updated.status).toBe('disbursed');
  });

  it('records the transaction as pending, never as confirmed on a caller-supplied hash', async () => {
    const id = await approved('passed');
    await treasury.disburseAllocation(id, '0xhash');

    const tx = db
      .prepare(
        'SELECT status, tx_hash, confirmed_at FROM treasury_transactions'
      )
      .get() as {
      status: string;
      tx_hash: string;
      confirmed_at: string | null;
    };

    expect(tx.status).toBe('pending');
    expect(tx.tx_hash).toBe('0xhash');
    expect(tx.confirmed_at).toBeNull();
  });

  it('writes the disbursement to the audit chain', async () => {
    const id = await approved('passed');
    await treasury.disburseAllocation(id, '0xhash');

    const entry = audit.recent().find(e => e.type === 'TREASURY_DISBURSED');
    expect(entry).toBeDefined();
    expect(entry!.subject_id).toBe('p1');
    expect(JSON.parse(entry!.payload).txHash).toBe('0xhash');
    expect(audit.verify().valid).toBe(true);
  });
});

describe('spending limits', () => {
  let db: Database.Database;
  let treasury: TreasuryService;

  beforeEach(() => {
    ({ db, treasury } = build());
  });

  it('keeps one row per category and token when a limit is changed', () => {
    treasury.setSpendingLimit('grants', TOKEN, {
      dailyLimit: (10n * ONE).toString(),
    });
    treasury.setSpendingLimit('grants', TOKEN, { dailyLimit: ONE.toString() });

    const rows = db
      .prepare(
        'SELECT daily_limit FROM treasury_spending_limits WHERE category = ?'
      )
      .all('grants') as Array<{ daily_limit: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].daily_limit).toBe(ONE.toString());
  });

  it('applies a tightened limit rather than the original one', () => {
    treasury.setSpendingLimit('grants', TOKEN, {
      dailyLimit: (10n * ONE).toString(),
    });
    treasury.setSpendingLimit('grants', TOKEN, { dailyLimit: ONE.toString() });

    expect(
      treasury.checkSpendingLimit('grants', TOKEN, (5n * ONE).toString())
    ).toBe(false);
  });

  it('sums spend beyond what a 64-bit integer can hold', () => {
    // 20 tokens already disbursed: past 2^63-1 wei, where SUM(CAST(...)) threw.
    seedProposal(db, 'p1', 'passed');
    const now = new Date().toISOString();
    for (let i = 0; i < 2; i++) {
      db.prepare(
        `INSERT INTO budget_allocations
           (id, proposal_id, category, token_address, token_symbol, amount, recipient, status, disbursed_at)
         VALUES (?, 'p1', 'grants', ?, 'ETH', ?, '0xbeef', 'disbursed', ?)`
      ).run(`a${i}`, TOKEN, (10n * ONE).toString(), now);
    }
    treasury.setSpendingLimit('grants', TOKEN, {
      dailyLimit: (25n * ONE).toString(),
    });

    // 20 spent + 10 requested = 30 > 25, and answering that at all requires not
    // overflowing on the way.
    expect(
      treasury.checkSpendingLimit('grants', TOKEN, (10n * ONE).toString())
    ).toBe(false);
    expect(
      treasury.checkSpendingLimit('grants', TOKEN, (4n * ONE).toString())
    ).toBe(true);
  });
});
