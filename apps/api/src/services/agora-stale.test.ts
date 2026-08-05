import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { isoMinutesAgo } from '../utils/time';

// cleanupStaleSessions' selection logic, extracted verbatim in shape from
// agora.ts. Constructing the real AgoraService pulls in the LLM queue,
// summoning and boot recovery, so the query itself is exercised here — it is
// the part that regressed (ISO-'T' vs datetime('now')) and the part that now
// has to cooperate with the bounded harvest.
function selectStale(
  db: Database.Database,
  opts: {
    maxIdleMinutes: number;
    limit?: number;
    preserveHarvestable?: { minMessages: number; hardCloseAfterMinutes: number };
  }
): string[] {
  const limit = opts.limit ?? 500;
  const preserve = opts.preserveHarvestable;
  const rows = preserve
    ? (db.prepare(`
        SELECT s.id FROM agora_sessions s
        WHERE s.status = 'active'
          AND s.updated_at < ?
          AND (
            s.updated_at < ?
            OR (SELECT COUNT(*) FROM agora_messages m
                WHERE m.session_id = s.id AND m.message_type = 'agent') < ?
          )
        ORDER BY s.updated_at ASC
        LIMIT ?
      `).all(
        isoMinutesAgo(opts.maxIdleMinutes),
        isoMinutesAgo(preserve.hardCloseAfterMinutes),
        preserve.minMessages,
        limit
      ) as Array<{ id: string }>)
    : (db.prepare(`
        SELECT id FROM agora_sessions
        WHERE status = 'active'
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT ?
      `).all(isoMinutesAgo(opts.maxIdleMinutes), limit) as Array<{ id: string }>);
  return rows.map(r => r.id);
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE agora_sessions (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
    CREATE TABLE agora_messages (id TEXT PRIMARY KEY, session_id TEXT, message_type TEXT);
  `);
  return db;
}

function seed(db: Database.Database, id: string, idleMinutes: number, agentMessages: number, status = 'active'): void {
  db.prepare('INSERT INTO agora_sessions (id, status, updated_at) VALUES (?, ?, ?)')
    .run(id, status, isoMinutesAgo(idleMinutes));
  const insert = db.prepare('INSERT INTO agora_messages (id, session_id, message_type) VALUES (?, ?, ?)');
  for (let i = 0; i < agentMessages; i++) insert.run(`${id}-m${i}`, id, 'agent');
  // System messages must not count toward "worth harvesting".
  insert.run(`${id}-sys`, id, 'system');
}

describe('stale Agora session selection', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('finds sessions stalled earlier the same day (the zombie-session regression)', () => {
    // 18h idle: under the old datetime('now') comparison this matched nothing
    // until the UTC date rolled over, so five such sessions were sitting
    // active on prod while the sweeper reported zero.
    seed(db, 'zombie', 18 * 60, 0);
    expect(selectStale(db, { maxIdleMinutes: 90 })).toEqual(['zombie']);
  });

  it('leaves fresh and already-completed sessions alone', () => {
    seed(db, 'fresh', 10, 0);
    seed(db, 'done', 18 * 60, 0, 'completed');
    expect(selectStale(db, { maxIdleMinutes: 90 })).toEqual([]);
  });

  it('preserves sessions with real deliberation for the harvest', () => {
    seed(db, 'substantive', 3 * 60, 12); // worth completing properly
    seed(db, 'empty', 3 * 60, 1);        // nothing to salvage
    const swept = selectStale(db, {
      maxIdleMinutes: 90,
      preserveHarvestable: { minMessages: 5, hardCloseAfterMinutes: 360 },
    });
    expect(swept).toEqual(['empty']);
  });

  it('hard-closes a substantive session that stayed stuck past the escape hatch', () => {
    seed(db, 'stuck', 7 * 60, 12); // 7h > 6h hard close
    const swept = selectStale(db, {
      maxIdleMinutes: 90,
      preserveHarvestable: { minMessages: 5, hardCloseAfterMinutes: 360 },
    });
    expect(swept).toEqual(['stuck']);
  });

  it('still sweeps everything when preservation is not requested (boot recovery)', () => {
    seed(db, 'substantive', 3 * 60, 12);
    expect(selectStale(db, { maxIdleMinutes: 90 })).toEqual(['substantive']);
  });
});
