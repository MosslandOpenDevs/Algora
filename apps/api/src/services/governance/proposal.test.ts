import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProposalService } from './proposal';

// resolveCompletedVotings is pure SQLite + socket emits, so exercise it
// against an in-memory database with a stub socket server. The schema
// mirrors the columns the service touches (db/index.ts is the authority).
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      proposer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      voting_starts TEXT,
      voting_ends TEXT,
      issue_id TEXT,
      decision_packet TEXT,
      tally TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      proposal_type TEXT DEFAULT 'general',
      co_proposers TEXT,
      version INTEGER DEFAULT 1,
      execution_date TEXT,
      content TEXT,
      budget TEXT,
      related_links TEXT
    );
    CREATE TABLE issues (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      resolved_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE activity_log (
      id TEXT PRIMARY KEY,
      type TEXT,
      severity TEXT,
      timestamp TEXT,
      message TEXT,
      details TEXT
    );
  `);
  return db;
}

type Emitted = { event: string; payload: unknown };

function makeService(db: Database.Database): { service: ProposalService; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  const io = { emit: (event: string, payload: unknown) => emitted.push({ event, payload }) };
  // Stub SocketServer: the service only calls io.emit.
  const service = new ProposalService(db, io as never);
  return { service, emitted };
}

function seedProposal(
  db: Database.Database,
  opts: {
    id: string;
    status?: string;
    votingEnds?: string | null;
    tally?: string | null;
    issueId?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO proposals (id, title, description, proposer, status, voting_ends, tally, issue_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    `Proposal ${opts.id}`,
    'Test proposal',
    'tester',
    opts.status ?? 'voting',
    opts.votingEnds ?? null,
    opts.tally ?? null,
    opts.issueId ?? null
  );
}

function seedIssue(db: Database.Database, id: string, status: string): void {
  db.prepare(`INSERT INTO issues (id, status) VALUES (?, ?)`).run(id, status);
}

function issueStatus(db: Database.Database, id: string): { status: string; resolved_at: string | null } {
  return db.prepare('SELECT status, resolved_at FROM issues WHERE id = ?').get(id) as {
    status: string;
    resolved_at: string | null;
  };
}

function proposalStatus(db: Database.Database, id: string): string {
  return (db.prepare('SELECT status FROM proposals WHERE id = ?').get(id) as { status: string }).status;
}

// A voting_ends a couple of hours in the past ON THE SAME DAY. Under the old
// datetime('now') comparison this was NOT considered expired until the date
// rolled over, because ISO 'T' (0x54) sorts after the space (0x20) in
// datetime('now')'s rendering — the regression this suite pins down.
const SAME_DAY_PAST = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

describe('resolveCompletedVotings', () => {
  let db: Database.Database;
  let service: ProposalService;
  let emitted: Emitted[];

  beforeEach(() => {
    db = makeDb();
    ({ service, emitted } = makeService(db));
  });

  it('resolves a same-day-expired voting with no votes as passed (passive consensus) and resolves the issue', () => {
    seedIssue(db, 'issue-1', 'pending_vote');
    seedProposal(db, { id: 'p1', votingEnds: SAME_DAY_PAST, issueId: 'issue-1' });

    const result = service.resolveCompletedVotings();

    expect(result.resolved).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.rejected).toBe(0);
    expect(proposalStatus(db, 'p1')).toBe('passed');

    const issue = issueStatus(db, 'issue-1');
    expect(issue.status).toBe('resolved');
    expect(issue.resolved_at).not.toBeNull();

    expect(emitted.some(e => e.event === 'issue:updated')).toBe(true);
    expect(emitted.some(e => e.event === 'proposal:status_changed')).toBe(true);
  });

  it('passes when the tally has more for than against votes', () => {
    seedIssue(db, 'issue-2', 'pending_vote');
    seedProposal(db, {
      id: 'p2',
      votingEnds: SAME_DAY_PAST,
      tally: JSON.stringify({ for: 3, against: 1 }),
      issueId: 'issue-2',
    });

    const result = service.resolveCompletedVotings();

    expect(result.passed).toBe(1);
    expect(proposalStatus(db, 'p2')).toBe('passed');
    expect(issueStatus(db, 'issue-2').status).toBe('resolved');
  });

  it('rejects when against >= for and reverts a pending_vote issue to detected', () => {
    seedIssue(db, 'issue-3', 'pending_vote');
    seedProposal(db, {
      id: 'p3',
      votingEnds: SAME_DAY_PAST,
      tally: JSON.stringify({ for: 1, against: 3 }),
      issueId: 'issue-3',
    });

    const result = service.resolveCompletedVotings();

    expect(result.rejected).toBe(1);
    expect(proposalStatus(db, 'p3')).toBe('rejected');
    expect(issueStatus(db, 'issue-3').status).toBe('detected');
  });

  it('does not revert issues outside the in-flight governance statuses on rejection', () => {
    seedIssue(db, 'issue-4', 'confirmed');
    seedProposal(db, {
      id: 'p4',
      votingEnds: SAME_DAY_PAST,
      tally: JSON.stringify({ for: 0, against: 2 }),
      issueId: 'issue-4',
    });

    service.resolveCompletedVotings();

    expect(proposalStatus(db, 'p4')).toBe('rejected');
    expect(issueStatus(db, 'issue-4').status).toBe('confirmed');
  });

  it('leaves unexpired votings and non-voting proposals untouched', () => {
    seedProposal(db, { id: 'p5', votingEnds: FUTURE });
    seedProposal(db, { id: 'p6', status: 'discussion', votingEnds: SAME_DAY_PAST });
    seedProposal(db, { id: 'p7', votingEnds: null });

    const result = service.resolveCompletedVotings();

    expect(result.resolved).toBe(0);
    expect(proposalStatus(db, 'p5')).toBe('voting');
    expect(proposalStatus(db, 'p6')).toBe('discussion');
    expect(proposalStatus(db, 'p7')).toBe('voting');
  });

  it('treats an unparseable tally as passed rather than wedging the queue', () => {
    seedProposal(db, { id: 'p8', votingEnds: SAME_DAY_PAST, tally: 'not-json' });

    const result = service.resolveCompletedVotings();

    expect(result.passed).toBe(1);
    expect(proposalStatus(db, 'p8')).toBe('passed');
  });

  it('records the voting → passed transition in proposal_history', () => {
    seedProposal(db, { id: 'p9', votingEnds: SAME_DAY_PAST });

    service.resolveCompletedVotings();

    const history = db
      .prepare('SELECT from_status, to_status, changed_by FROM proposal_history WHERE proposal_id = ?')
      .all('p9') as Array<{ from_status: string; to_status: string; changed_by: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ from_status: 'voting', to_status: 'passed', changed_by: 'voting-resolver' });
  });
});

describe('autoPromoteDiscussions', () => {
  it('promotes a discussion proposal whose soak elapsed earlier the same day', () => {
    const db = makeDb();
    const { service } = makeService(db);
    const soaked = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO proposals (id, title, description, proposer, status, updated_at)
       VALUES ('d1', 'T', 'D', 'tester', 'discussion', ?)`
    ).run(soaked);

    const result = service.autoPromoteDiscussions();

    expect(result.promoted).toBe(1);
    const row = db
      .prepare('SELECT status, voting_starts, voting_ends FROM proposals WHERE id = ?')
      .get('d1') as { status: string; voting_starts: string; voting_ends: string };
    expect(row.status).toBe('voting');
    expect(row.voting_starts).toBeTruthy();
    expect(row.voting_ends > row.voting_starts).toBe(true);
  });
});
