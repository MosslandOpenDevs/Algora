/**
 * Chatter must reach the feed with its content, and carry honest provenance.
 *
 * Two defects, both in how a chatter line is recorded rather than how it is
 * produced.
 *
 * The activity row's `message` column read `"<Agent> said something"`, with
 * what was actually said tucked into `details`. `ActivityFeed` renders
 * `message || details`, so the placeholder always won — **57 of the last 400
 * chatter entries reached the dashboard carrying no content at all**, on the
 * surface the project specifies must never look idle. The scheduler's own
 * chatter path has always logged the real line; only this one did not.
 *
 * And the tier was recorded as `isTier1Available() ? 1 : 0` — a statement
 * about what the system *could* have used, not what it did. A canned idle
 * message would be filed as tier 1 whenever the model was merely reachable and
 * the call failed. Measured on production: **0 of 29,723 tier-1 rows match a
 * stored idle message**, so this has not actually mislabelled anything — the
 * model path is succeeding. It is fixed because the field claims provenance
 * and should earn it, not because it has gone wrong. `agora.ts` already
 * returns tier 0 for its own template fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

import { createSchema } from '../db';
import { ChatterService } from './chatter';

interface ChatterInternals {
  logActivity(agent: { id: string; display_name: string }, content: string): void;
  saveChatter(
    agent: { id: string; display_name: string; color: string },
    content: string,
    tier: number,
  ): { tier: number };
}

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createSchema(db);
  // Every NOT NULL column, so a schema change fails here rather than leaving a
  // fixture that silently seeds nothing.
  db.prepare(
    `INSERT INTO agents
       (id, name, display_name, group_name, persona_prompt, color, is_active)
     VALUES ('white-hat', 'white-hat', 'White Hat', 'guardians', 'A security guardian.', '#fff', 1)`,
  ).run();
  db.prepare(`INSERT INTO agent_states (agent_id, status) VALUES ('white-hat', 'idle')`).run();
  return db;
}

/**
 * Both behaviours under test are private recording steps, reached here rather
 * than through the 30-second interval loop that normally drives them.
 */
function service(db: Database.Database): ChatterInternals {
  const io = { emit: () => undefined, on: () => undefined } as unknown as SocketServer;
  return new ChatterService(db, io) as unknown as ChatterInternals;
}

const AGENT = { id: 'white-hat', display_name: 'White Hat', color: '#fff' };
const LINE = 'That is a stark reminder about the importance of risk controls.';

describe('chatter reaches the activity feed', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('logs what was said, not that something was said', () => {
    service(db).logActivity(AGENT, LINE);

    const row = db
      .prepare(`SELECT message FROM activity_log WHERE type = 'AGENT_CHATTER'`)
      .get() as { message: string };

    expect(row.message).toBe(LINE);
    // The exact shape that reached the dashboard 57 times in 400.
    expect(row.message).not.toMatch(/said something$/);
  });

  it('still records which agent spoke', () => {
    service(db).logActivity(AGENT, LINE);

    const row = db
      .prepare(`SELECT agent_id, details FROM activity_log WHERE type = 'AGENT_CHATTER'`)
      .get() as { agent_id: string; details: string };

    expect(row.agent_id).toBe('white-hat');
    expect(row.details).toBe('White Hat');
  });
});

describe('chatter records the tier that produced it', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('stores the tier it is given rather than what was merely available', () => {
    // 0 is what a canned idle message should carry, whatever the model's state.
    service(db).saveChatter(AGENT, LINE, 0);

    const row = db.prepare(`SELECT tier FROM agent_chatter`).get() as { tier: number };
    expect(row.tier).toBe(0);
  });

  it('carries tier 1 through when the model produced the line', () => {
    service(db).saveChatter(AGENT, LINE, 1);

    const row = db.prepare(`SELECT tier FROM agent_chatter`).get() as { tier: number };
    expect(row.tier).toBe(1);
  });

  it('returns the same tier it stored', () => {
    // The socket payload and the row must agree; they were computed separately
    // from the same availability check before.
    expect(service(db).saveChatter(AGENT, LINE, 0).tier).toBe(0);
  });
});
