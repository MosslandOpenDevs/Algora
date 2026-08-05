/**
 * Audit-chain coverage for the proposal lifecycle.
 *
 * AuditService declares ten event types but only four were ever appended, all of
 * them from VotingService — ProposalService held no reference to the audit log at
 * all, so creating, submitting and cancelling a proposal left no entry in the
 * hash-chained record the product presents as its audit trail.
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

function newProposal(governance: GovernanceService, proposer = 'alice') {
  return governance.proposals.create({
    title: 'Fund the thing',
    description: 'because',
    proposer,
    category: 'general',
  });
}

function auditTypes(
  governance: GovernanceService,
  subjectId: string
): string[] {
  return governance.audit.getBySubject(subjectId).map(entry => entry.type);
}

describe('proposal lifecycle audit coverage', () => {
  let db: Database.Database;
  let governance: GovernanceService;

  beforeEach(() => {
    ({ db, governance } = buildGovernance());
  });

  it('records creation', () => {
    const proposal = newProposal(governance);

    expect(auditTypes(governance, proposal.id)).toContain('PROPOSAL_CREATED');
  });

  it('records the proposer as the actor', () => {
    const proposal = newProposal(governance, 'carol');

    const entry = governance.audit
      .getBySubject(proposal.id)
      .find(e => e.type === 'PROPOSAL_CREATED');

    expect(entry?.actor).toBe('carol');
  });

  it('records submission', () => {
    const proposal = newProposal(governance);
    governance.proposals.submit(proposal.id, 'bob');

    expect(auditTypes(governance, proposal.id)).toContain('PROPOSAL_SUBMITTED');
  });

  it('records cancellation with its reason', () => {
    const proposal = newProposal(governance);
    governance.proposals.cancel(proposal.id, 'bob', 'superseded');

    const entry = governance.audit
      .getBySubject(proposal.id)
      .find(e => e.type === 'PROPOSAL_CANCELLED');

    expect(entry).toBeDefined();
    expect(JSON.parse(entry!.payload).reason).toBe('superseded');
  });

  it('records finalization when the scheduler resolves a voting', () => {
    // resolveCompletedVotings delegates to VotingService.finalizeVoting, so the
    // scheduled path produces the same audit entry the manual endpoint does.
    const proposal = newProposal(governance);
    const endedAnHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.prepare(
      `UPDATE proposals SET status = 'voting', voting_ends = ? WHERE id = ?`
    ).run(endedAnHourAgo, proposal.id);
    db.prepare(
      `INSERT INTO votes (id, proposal_id, voter, choice, weight) VALUES (?, ?, 'alice', 'for', 60)`
    ).run('v1', proposal.id);

    governance.proposals.resolveCompletedVotings();

    expect(auditTypes(governance, proposal.id)).toContain('PROPOSAL_FINALIZED');
  });

  it('keeps the chain verifiable across the whole lifecycle', () => {
    const first = newProposal(governance);
    governance.proposals.submit(first.id, 'bob');
    const second = newProposal(governance, 'dave');
    governance.proposals.cancel(second.id, 'dave', 'withdrawn');

    const result = governance.audit.verify();

    expect(result.valid).toBe(true);
    expect(result.checked).toBe(4);
  });

  it("does not attribute one proposal's entries to another", () => {
    const first = newProposal(governance);
    const second = newProposal(governance, 'dave');
    governance.proposals.cancel(second.id, 'dave', 'withdrawn');

    expect(auditTypes(governance, first.id)).toEqual(['PROPOSAL_CREATED']);
  });
});
