/**
 * The escalation loop: an escalation must start a deliberation, and close when
 * that deliberation finishes.
 *
 * `extended_discussion` — the mechanism for "the agents could not agree, go
 * deeper" — hand-wrote its follow-up session with `INSERT INTO agora_sessions
 * ... status 'pending'`. Nothing in the codebase consumes that status, so no
 * agent was summoned, no round timer started, and not one message was ever
 * written. Meanwhile the escalation recorded `assigned_to` and marked itself
 * `in_progress`, so it read as handled.
 *
 * In production that produced 37 escalations spanning 16 days, every assigned
 * session still `pending` with zero messages, and zero escalations resolved in
 * the table's entire history — a queue with no exit, pinning the escalation
 * health stage at "critical" where it could never recover.
 *
 * Three properties pinned here, because fixing only one leaves the loop open:
 *   1. escalating goes through the orchestrator, which is what starts a session
 *   2. finishing that session resolves the escalation
 *   3. the repair for already-stranded rows touches only provably dead ones
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

import { createSchema } from '../db';
import { GovernanceOSBridge } from './governance-os-bridge';


function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

function makeBridge(db: Database.Database): GovernanceOSBridge {
  // The bridge only wires listeners and emits; nothing here asserts on socket
  // traffic, so a stub of the two methods it calls is enough.
  const io = { emit: () => undefined, on: () => undefined } as unknown as SocketServer;
  return new GovernanceOSBridge(db, io);
}

/** An escalation pointing at a session, in whatever state the test needs. */
function seedEscalation(
  db: Database.Database,
  opts: { escalationId: string; sessionId: string; sessionStatus: string; messages?: number },
): void {
  const insertSession = db.prepare(
    `INSERT INTO agora_sessions (id, title, status, current_round, max_rounds)
     VALUES (?, ?, ?, 1, 8)`,
  );

  // The original low-consensus session the escalation was raised from, and the
  // follow-up session it assigned. Both are real rows: escalated_sessions has
  // a foreign key to each.
  const originalId = `${opts.sessionId}-origin`;
  insertSession.run(originalId, 'Treasury policy', 'completed');
  insertSession.run(opts.sessionId, '[Extended] Treasury policy', opts.sessionStatus);

  for (let i = 0; i < (opts.messages ?? 0); i++) {
    db.prepare(
      `INSERT INTO agora_messages (id, session_id, message_type, content)
       VALUES (?, ?, 'agent', ?)`,
    ).run(`${opts.sessionId}-m${i}`, opts.sessionId, 'a turn happened');
  }

  db.prepare(
    `INSERT INTO escalated_sessions (id, session_id, escalation_type, status, assigned_to)
     VALUES (?, ?, 'extended_discussion', 'in_progress', ?)`,
  ).run(opts.escalationId, originalId, opts.sessionId);
}

const statusOf = (db: Database.Database, id: string) =>
  (db.prepare('SELECT status FROM escalated_sessions WHERE id = ?').get(id) as { status: string })
    .status;

describe('escalation closes when its deliberation finishes', () => {
  let db: Database.Database;
  let bridge: GovernanceOSBridge;

  beforeEach(() => {
    db = freshDb();
    bridge = makeBridge(db);
  });

  it('resolves the escalation whose session completed', async () => {
    seedEscalation(db, { escalationId: 'esc-1', sessionId: 'sess-1', sessionStatus: 'active', messages: 6 });

    await bridge.handleAgoraSessionCompleted({
      sessionId: 'sess-1',
      title: '[Extended] Treasury policy',
      consensusScore: 0.42,
      recommendation: 'Still divided',
      totalRounds: 8,
    });

    expect(statusOf(db, 'esc-1')).toBe('resolved');
  });

  it('resolves regardless of consensus — the escalation asked for the discussion, not for agreement', async () => {
    seedEscalation(db, { escalationId: 'esc-low', sessionId: 'sess-low', sessionStatus: 'active', messages: 6 });

    await bridge.handleAgoraSessionCompleted({
      sessionId: 'sess-low',
      title: '[Extended] Treasury policy',
      consensusScore: 0.05,
      recommendation: 'No agreement',
      totalRounds: 8,
    });

    expect(statusOf(db, 'esc-low')).toBe('resolved');
  });

  it('leaves escalations belonging to other sessions alone', async () => {
    seedEscalation(db, { escalationId: 'esc-a', sessionId: 'sess-a', sessionStatus: 'active', messages: 6 });
    seedEscalation(db, { escalationId: 'esc-b', sessionId: 'sess-b', sessionStatus: 'active', messages: 6 });

    await bridge.handleAgoraSessionCompleted({
      sessionId: 'sess-a',
      title: '[Extended] Treasury policy',
      consensusScore: 0.8,
      recommendation: 'Agreed',
      totalRounds: 8,
    });

    expect(statusOf(db, 'esc-a')).toBe('resolved');
    expect(statusOf(db, 'esc-b')).toBe('in_progress');
  });
});

describe('escalating starts a deliberation that can actually run', () => {
  let db: Database.Database;
  let bridge: GovernanceOSBridge;

  /** Consensus 0.5–0.7 over >=3 rounds is the extended_discussion band. */
  const lowConsensusCompletion = {
    sessionId: 'weak-session',
    title: 'Treasury policy',
    issueId: 'issue-1',
    consensusScore: 0.6,
    recommendation: 'Divided',
    totalRounds: 5,
  };

  beforeEach(() => {
    db = freshDb();
    bridge = makeBridge(db);
    db.prepare(
      `INSERT INTO issues (id, title, description, category, priority, status, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('issue-1', 'Treasury policy', 'desc', 'treasury', 'high', 'open', '2026-03-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO agora_sessions (id, title, status, current_round, max_rounds)
       VALUES (?, ?, 'completed', 5, 5)`,
    ).run('weak-session', 'Treasury policy');
  });

  it('creates the follow-up session through the orchestrator', async () => {
    const created: Array<{ maxRounds?: number }> = [];
    bridge.setAgoraService({
      async createSession(options) {
        created.push(options);
        db.prepare(
          `INSERT INTO agora_sessions (id, title, status, current_round, max_rounds)
           VALUES (?, ?, 'active', 1, ?)`,
        ).run('extended-session', options.title, options.maxRounds ?? 5);
        return { id: 'extended-session' };
      },
      async addParticipant() {
        return true;
      },
    });

    await bridge.handleAgoraSessionCompleted(lowConsensusCompletion);

    // Going through createSession is the whole fix: a hand-written INSERT
    // produced a session no orchestrator ever picked up.
    expect(created).toHaveLength(1);
    expect(created[0].maxRounds).toBe(8); // 5 previous rounds + 3

    const escalation = db
      .prepare(`SELECT status, assigned_to FROM escalated_sessions WHERE session_id = ?`)
      .get('weak-session') as { status: string; assigned_to: string };
    expect(escalation.status).toBe('in_progress');
    expect(escalation.assigned_to).toBe('extended-session');
  });

  it('fails the escalation loudly when no orchestrator is connected', async () => {
    // Never silently record an escalation nothing can act on — that is exactly
    // how 37 of them accumulated unnoticed.
    await bridge.handleAgoraSessionCompleted(lowConsensusCompletion);

    const escalation = db
      .prepare(`SELECT status, resolution FROM escalated_sessions WHERE session_id = ?`)
      .get('weak-session') as { status: string; resolution: string | null };
    expect(escalation.status).toBe('failed');
    expect(escalation.resolution).toMatch(/not connected/i);
  });
});

describe('reconciling escalations stranded before the fix', () => {
  let db: Database.Database;
  let bridge: GovernanceOSBridge;

  beforeEach(() => {
    db = freshDb();
    bridge = makeBridge(db);
  });

  it('retires an escalation whose session never started', () => {
    // The production shape: assigned session still 'pending', zero messages.
    seedEscalation(db, { escalationId: 'esc-dead', sessionId: 'sess-dead', sessionStatus: 'pending' });

    expect(bridge.reconcileStrandedEscalations()).toEqual({ retired: 1, sessions: 1 });
    expect(statusOf(db, 'esc-dead')).toBe('failed');
    // The inert session is retired too, so it stops reading as work in flight.
    const session = db.prepare('SELECT status FROM agora_sessions WHERE id = ?').get('sess-dead') as {
      status: string;
    };
    expect(session.status).toBe('failed');
  });

  it('spares a pending session that produced messages — something did run there', () => {
    seedEscalation(db, {
      escalationId: 'esc-live',
      sessionId: 'sess-live',
      sessionStatus: 'pending',
      messages: 1,
    });

    expect(bridge.reconcileStrandedEscalations().retired).toBe(0);
    expect(statusOf(db, 'esc-live')).toBe('in_progress');
  });

  it('spares an escalation whose session is genuinely running', () => {
    seedEscalation(db, { escalationId: 'esc-active', sessionId: 'sess-active', sessionStatus: 'active' });

    expect(bridge.reconcileStrandedEscalations().retired).toBe(0);
    expect(statusOf(db, 'esc-active')).toBe('in_progress');
  });

  it('is idempotent — a second pass finds nothing left to retire', () => {
    seedEscalation(db, { escalationId: 'esc-dead', sessionId: 'sess-dead', sessionStatus: 'pending' });

    expect(bridge.reconcileStrandedEscalations().retired).toBe(1);
    expect(bridge.reconcileStrandedEscalations().retired).toBe(0);
  });
});
