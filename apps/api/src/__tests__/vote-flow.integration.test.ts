/**
 * End-to-end test of the vote flow:
 *   typed-data → wallet sign → POST /vote → DB + audit_log updated → replay rejected.
 *
 * Builds a minimal Express app with just the services the vote endpoint
 * actually touches (Governance, Audit via Governance, Signature). No
 * schedulers, no LLM service, no sockets.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { ethers } from 'ethers';

import { createSchema } from '../db';
import { GovernanceService } from '../services/governance';
import { SignatureService } from '../services/signature';
import { proposalsRouter } from '../routes/proposals';
import { auditRouter } from '../routes/audit';

const ADMIN_KEY = 'integration-test-admin-key-abc123';

function buildApp(opts: { enforceSignatures: boolean }): {
  app: Express;
  db: Database.Database;
  governance: GovernanceService;
  signatureService: SignatureService;
} {
  process.env.ADMIN_API_KEY = ADMIN_KEY;

  const db = new Database(':memory:');
  createSchema(db);

  // Socket.IO requires an HTTP server; we create one but never .listen().
  const httpServer = createServer();
  const io = new SocketServer(httpServer);

  const governance = new GovernanceService(db, io);
  const signatureService = new SignatureService(db, opts.enforceSignatures);

  const app = express();
  app.use(express.json());
  app.locals.db = db;
  app.locals.governance = governance;
  app.locals.signatureService = signatureService;

  app.use('/api/proposals', proposalsRouter);
  app.use('/api/audit', auditRouter);

  return { app, db, governance, signatureService };
}

function seedVotingProposal(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  const votingEnds = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO proposals (id, title, description, proposer, status, created_at, updated_at, voting_ends)
    VALUES (?, 'Test', 'desc', 'seed', 'voting', ?, ?, ?)
  `).run(id, now, now, votingEnds);
}

describe('Vote flow — integration', () => {
  let ctx: ReturnType<typeof buildApp>;
  let wallet: ReturnType<typeof ethers.Wallet.createRandom>;
  const proposalId = 'prop-int-1';

  beforeAll(() => {
    // Prevent accidental real fetches from any transitive service.
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    ctx = buildApp({ enforceSignatures: true });
    seedVotingProposal(ctx.db, proposalId);
    wallet = ethers.Wallet.createRandom();
  });

  async function signVote(params: {
    choice: 'for' | 'against' | 'abstain';
    nonce: string;
    issuedAt: number;
  }): Promise<string> {
    const td = ctx.signatureService.buildTypedData({
      proposalId,
      choice: params.choice,
      voter: wallet.address,
      nonce: params.nonce,
      issuedAt: params.issuedAt,
    });
    return wallet.signTypedData(td.domain, td.types, td.message);
  }

  it('rejects unsigned vote when signatures are enforced', async () => {
    const res = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'for' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature required/i);
  });

  it('completes the full signed-vote flow and records an audit entry', async () => {
    // 1. Fetch typed-data the server will expect
    const nonce = 'n-flow-1';
    const typedRes = await request(ctx.app)
      .get(`/api/proposals/${proposalId}/vote/typed-data`)
      .query({ voter: wallet.address, choice: 'for', nonce });
    expect(typedRes.status).toBe(200);
    expect(typedRes.body.primaryType).toBe('Vote');
    const issuedAt = typedRes.body.message.issuedAt as number;

    // 2. Sign it
    const signature = await signVote({ choice: 'for', nonce, issuedAt });

    // 3. POST the vote
    const voteRes = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'for', nonce, issuedAt, signature });
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.vote).toBeDefined();
    expect(voteRes.body.vote.choice).toBe('for');

    // 4. DB has the vote
    const row = ctx.db.prepare(
      'SELECT * FROM votes WHERE proposal_id = ? AND voter = ?',
    ).get(proposalId, wallet.address) as { choice: string } | undefined;
    expect(row?.choice).toBe('for');

    // 5. Audit chain captured it
    const auditRes = await request(ctx.app).get('/api/audit/recent').query({ limit: 10 });
    const voteEntry = auditRes.body.entries.find(
      (e: { type: string; subject_id: string }) => e.type === 'VOTE_CAST' && e.subject_id === proposalId,
    );
    expect(voteEntry).toBeDefined();
    expect(voteEntry.actor).toBe(wallet.address);

    // 6. Verify endpoint confirms the chain is intact
    const verifyRes = await request(ctx.app)
      .get('/api/audit/verify')
      .set('x-admin-key', ADMIN_KEY);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
  });

  it('rejects nonce replay', async () => {
    const nonce = 'n-replay-1';
    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await signVote({ choice: 'for', nonce, issuedAt });

    const first = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'for', nonce, issuedAt, signature });
    expect(first.status).toBe(200);

    const replay = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'for', nonce, issuedAt, signature });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toMatch(/nonce/i);
  });

  it('rejects a signature signed by a different wallet', async () => {
    const attacker = ethers.Wallet.createRandom();
    const nonce = 'n-attacker-1';
    const issuedAt = Math.floor(Date.now() / 1000);

    const td = ctx.signatureService.buildTypedData({
      proposalId,
      choice: 'for',
      voter: wallet.address, // claim to be wallet
      nonce,
      issuedAt,
    });
    const signature = await attacker.signTypedData(td.domain, td.types, td.message);

    const res = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'for', nonce, issuedAt, signature });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signer does not match|Signature verification/i);
  });

  it('rejects vote without auth header', async () => {
    const res = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .send({ voter: wallet.address, choice: 'for' });
    expect(res.status).toBe(401);
  });

  it('audit verify endpoint requires admin key', async () => {
    const res = await request(ctx.app).get('/api/audit/verify');
    expect(res.status).toBe(401);
  });
});

describe('Vote flow — signatures disabled (dev mode)', () => {
  it('allows unsigned human vote when enforcement is off', async () => {
    const ctx = buildApp({ enforceSignatures: false });
    const proposalId = 'prop-dev-1';
    seedVotingProposal(ctx.db, proposalId);

    const wallet = ethers.Wallet.createRandom();
    const res = await request(ctx.app)
      .post(`/api/proposals/${proposalId}/vote`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ voter: wallet.address, choice: 'abstain' });

    expect(res.status).toBe(200);
    expect(res.body.vote.choice).toBe('abstain');
  });
});
