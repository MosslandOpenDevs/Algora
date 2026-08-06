/**
 * Where a balance comes from.
 *
 * getTokenBalance had two fail-open paths. With no contract it returned
 * getMockBalance — a deterministic function of the address that lands every
 * wallet between roughly 2,000 and 4,300 MOC, comfortably over the 1-token
 * voting minimum, and reachable through the unauthenticated wallet-verify
 * endpoints. And when a chain read failed it returned '0', which callers persist:
 * a transient RPC outage silently zeroed a genuine holder's balance and voting
 * power, permanently.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

import { createSchema } from '../../db';
import { TokenService } from './token';

const WALLET = '0x000000000000000000000000000000000000beef';

function build(config?: Record<string, unknown>): {
  db: Database.Database;
  token: TokenService;
} {
  const db = new Database(':memory:');
  createSchema(db);
  const io = new SocketServer(createServer());
  return { db, token: new TokenService(db, io, config as never) };
}

/** Replace the contract with one whose reads always fail, as a dead RPC would. */
function breakChainReads(token: TokenService): void {
  (token as unknown as { tokenContract: unknown }).tokenContract = {
    balanceOf: async () => {
      throw new Error('missing response for request');
    },
  };
}

describe('getTokenBalance', () => {
  let token: TokenService;

  beforeEach(() => {
    ({ token } = build());
  });

  it('falls back to a fabricated balance only when no chain is configured', async () => {
    const balance = await token.getTokenBalance(WALLET);

    // Fabricated, and large enough to clear the voting minimum — which is the
    // whole problem this guards.
    expect(BigInt(balance)).toBeGreaterThan(0n);
  });

  it('throws rather than returning 0 when a configured chain read fails', async () => {
    breakChainReads(token);

    await expect(token.getTokenBalance(WALLET)).rejects.toThrow(
      /Could not read the on-chain balance/
    );
  });

  it('does not fabricate a balance when a chain read fails', async () => {
    breakChainReads(token);

    // The failure must not silently become a number of any kind — neither a
    // fabricated one nor zero.
    await expect(token.getTokenBalance(WALLET)).rejects.toThrow();
  });
});

describe('refreshHolderBalance', () => {
  let db: Database.Database;
  let token: TokenService;

  beforeEach(() => {
    ({ db, token } = build());
  });

  it('leaves a stored balance untouched when the chain cannot be read', async () => {
    // A holder registered while the chain was readable.
    const holder = await token.registerHolder(WALLET);
    const before = db
      .prepare('SELECT balance, voting_power FROM token_holders WHERE id = ?')
      .get(holder.id) as { balance: string; voting_power: number };
    expect(BigInt(before.balance)).toBeGreaterThan(0n);

    breakChainReads(token);
    await expect(token.refreshHolderBalance(holder.id)).rejects.toThrow();

    const after = db
      .prepare('SELECT balance, voting_power FROM token_holders WHERE id = ?')
      .get(holder.id) as { balance: string; voting_power: number };

    expect(after.balance).toBe(before.balance);
    expect(after.voting_power).toBe(before.voting_power);
  });
});
