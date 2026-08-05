/**
 * Regression tests for how the scheduled resolver reads a recorded tally.
 *
 * resolveCompletedVotings reads `proposals.tally` and used to treat `for` and
 * `against` as plain numbers. VotingService.calculateTally writes them as
 * { weight, count } objects, so `forVotes > againstVotes` compared
 * "[object Object]" to itself — always false — and every proposal that had
 * actually received a vote resolved to rejected regardless of the result.
 * proposal.test.ts covers the plain-number shape and the passive-consensus and
 * expiry rules; this file pins the object shape that production really writes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

import { createSchema } from '../../db';
import { GovernanceService } from './index';

function buildGovernance(): {
  db: Database.Database;
  governance: GovernanceService;
} {
  const db = new Database(':memory:');
  createSchema(db);
  const io = new SocketServer(createServer());
  return { db, governance: new GovernanceService(db, io) };
}

/** The shape VotingService.calculateTally actually persists. */
function weightedTally(forWeight: number, againstWeight: number): string {
  return JSON.stringify({
    for: { weight: forWeight, count: forWeight > 0 ? 1 : 0 },
    against: { weight: againstWeight, count: againstWeight > 0 ? 1 : 0 },
    abstain: { weight: 0, count: 0 },
    total_weight: forWeight + againstWeight,
    total_votes: (forWeight > 0 ? 1 : 0) + (againstWeight > 0 ? 1 : 0),
    quorum_reached: true,
    outcome: 'pending',
  });
}

function seedExpiredVoting(
  db: Database.Database,
  id: string,
  tally: string | null
): void {
  const now = new Date().toISOString();
  const endedAnHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO proposals (id, title, description, proposer, status, created_at, updated_at, voting_ends, tally)
     VALUES (?, ?, 'desc', 'seed', 'voting', ?, ?, ?, ?)`
  ).run(id, `Proposal ${id}`, now, now, endedAnHourAgo, tally);
}

function statusOf(db: Database.Database, id: string): string {
  return (
    db.prepare('SELECT status FROM proposals WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;
}

describe('resolveCompletedVotings', () => {
  let db: Database.Database;
  let governance: GovernanceService;

  beforeEach(() => {
    ({ db, governance } = buildGovernance());
  });

  it('passes a weight-based tally whose for side is larger', () => {
    seedExpiredVoting(db, 'p-for', weightedTally(60, 40));

    const result = governance.proposals.resolveCompletedVotings();

    expect(result.passed).toBe(1);
    expect(result.rejected).toBe(0);
    expect(statusOf(db, 'p-for')).toBe('passed');
  });

  it('rejects a weight-based tally whose against side is larger', () => {
    seedExpiredVoting(db, 'p-against', weightedTally(40, 60));

    const result = governance.proposals.resolveCompletedVotings();

    expect(result.rejected).toBe(1);
    expect(statusOf(db, 'p-against')).toBe('rejected');
  });

  it('rejects a tie rather than passing it', () => {
    seedExpiredVoting(db, 'p-tie', weightedTally(50, 50));

    governance.proposals.resolveCompletedVotings();

    expect(statusOf(db, 'p-tie')).toBe('rejected');
  });

  it('reads a tally VotingService itself produced', () => {
    // Guards against the shapes drifting apart again: this tally is not
    // hand-written, it is whatever calculateTally emits for these votes.
    seedExpiredVoting(db, 'p-real', null);
    db.prepare(
      `INSERT INTO votes (id, proposal_id, voter, choice, weight) VALUES (?, ?, ?, ?, ?)`
    ).run('v1', 'p-real', 'alice', 'for', 60);
    db.prepare(
      `INSERT INTO votes (id, proposal_id, voter, choice, weight) VALUES (?, ?, ?, ?, ?)`
    ).run('v2', 'p-real', 'bob', 'against', 40);

    const tally = governance.voting.calculateTally('p-real');
    db.prepare('UPDATE proposals SET tally = ? WHERE id = ?').run(
      JSON.stringify(tally),
      'p-real'
    );

    governance.proposals.resolveCompletedVotings();

    expect(statusOf(db, 'p-real')).toBe('passed');
  });

  it('treats an all-abstain tally as passive consensus', () => {
    seedExpiredVoting(db, 'p-abstain', weightedTally(0, 0));

    governance.proposals.resolveCompletedVotings();

    expect(statusOf(db, 'p-abstain')).toBe('passed');
  });

  it('leaves a voting that has not expired yet alone', () => {
    const now = new Date().toISOString();
    const endsLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO proposals (id, title, description, proposer, status, created_at, updated_at, voting_ends)
       VALUES ('p-open', 'open', 'desc', 'seed', 'voting', ?, ?, ?)`
    ).run(now, now, endsLater);

    const result = governance.proposals.resolveCompletedVotings();

    expect(result.resolved).toBe(0);
    expect(statusOf(db, 'p-open')).toBe('voting');
  });
});
