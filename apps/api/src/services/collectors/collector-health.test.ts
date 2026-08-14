import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readCollectorLiveness, staleThresholdMs, isCollectorStale } from './index';

// The health check judged liveness by counting rows the collector had written
// to the signals table in the past 5 minutes. Signals are deduplicated on
// insert and fetch intervals run 15-120 minutes, so healthy collectors read as
// dead and were restarted on every 30s tick — 128,470 restarts on one of them
// in production, with each start() re-sweeping every source.
//
// These exercise the replacement: liveness read from the source table's
// last_fetched, against a window derived from the configured interval.

const MINUTE = 60 * 1000;
const NOW = Date.parse('2026-08-14T08:00:00.000Z');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE rss_feeds (
      id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      fetch_interval INTEGER DEFAULT 30,
      last_fetched TEXT
    );
  `);
  return db;
}

function seed(
  db: Database.Database,
  id: string,
  opts: { intervalMinutes: number; fetchedMinutesAgo?: number | null; enabled?: boolean }
): void {
  const lastFetched =
    opts.fetchedMinutesAgo == null
      ? null
      : new Date(NOW - opts.fetchedMinutesAgo * MINUTE).toISOString();
  db.prepare(
    'INSERT INTO rss_feeds (id, enabled, fetch_interval, last_fetched) VALUES (?, ?, ?, ?)'
  ).run(id, opts.enabled === false ? 0 : 1, opts.intervalMinutes, lastFetched);
}

describe('collector liveness', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('reports the newest fetch and the slowest interval among enabled sources', () => {
    seed(db, 'fast', { intervalMinutes: 15, fetchedMinutesAgo: 40 });
    seed(db, 'slow', { intervalMinutes: 120, fetchedMinutesAgo: 5 });

    const liveness = readCollectorLiveness(db, 'rss_feeds');

    expect(liveness.enabledSources).toBe(2);
    expect(liveness.maxIntervalMinutes).toBe(120);
    expect(liveness.lastFetchedAt).toBe(new Date(NOW - 5 * MINUTE).toISOString());
  });

  it('ignores disabled sources', () => {
    seed(db, 'on', { intervalMinutes: 30, fetchedMinutesAgo: 10 });
    seed(db, 'off', { intervalMinutes: 120, fetchedMinutesAgo: 1, enabled: false });

    const liveness = readCollectorLiveness(db, 'rss_feeds');

    expect(liveness.enabledSources).toBe(1);
    expect(liveness.maxIntervalMinutes).toBe(30);
  });

  it('reports never-fetched sources as null rather than absent', () => {
    seed(db, 'cold', { intervalMinutes: 30, fetchedMinutesAgo: null });

    expect(readCollectorLiveness(db, 'rss_feeds').lastFetchedAt).toBeNull();
  });
});

describe('stale threshold', () => {
  it('allows two full fetch cycles', () => {
    expect(staleThresholdMs(120)).toBe(240 * MINUTE);
  });

  it('floors short intervals so a just-started collector is not called stale', () => {
    // 5-minute interval doubled is 10 minutes, but start() defers its first
    // fetch and a sweep takes time, so the floor governs.
    expect(staleThresholdMs(5)).toBe(10 * MINUTE);
    expect(staleThresholdMs(0)).toBe(10 * MINUTE);
    expect(staleThresholdMs(null)).toBe(10 * MINUTE);
  });

  it('caps absurd intervals so staleness detection stays live', () => {
    expect(staleThresholdMs(60 * 24 * 30)).toBe(6 * 60 * MINUTE);
  });
});

describe('staleness decision', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('holds a collector healthy between fetches of a slow source', () => {
    // The regression in one line: a 120-minute source fetched 30 minutes ago
    // is working exactly as configured, and the old 5-minute window restarted
    // it anyway.
    seed(db, 'slow', { intervalMinutes: 120, fetchedMinutesAgo: 30 });

    expect(isCollectorStale(readCollectorLiveness(db, 'rss_feeds'), NOW, NOW)).toBe(false);
  });

  it('flags a collector that has missed more than two cycles', () => {
    seed(db, 'slow', { intervalMinutes: 30, fetchedMinutesAgo: 61 });

    expect(isCollectorStale(readCollectorLiveness(db, 'rss_feeds'), NOW, NOW)).toBe(true);
  });

  it('does not flag a collector with nothing enabled to fetch', () => {
    seed(db, 'off', { intervalMinutes: 30, fetchedMinutesAgo: 600, enabled: false });

    expect(isCollectorStale(readCollectorLiveness(db, 'rss_feeds'), NOW, NOW)).toBe(false);
  });

  it('grants a never-fetched collector its grace period from service start', () => {
    seed(db, 'cold', { intervalMinutes: 30, fetchedMinutesAgo: null });
    const liveness = readCollectorLiveness(db, 'rss_feeds');

    // Booted a minute ago: still inside the window, no restart.
    expect(isCollectorStale(liveness, NOW, NOW - 1 * MINUTE)).toBe(false);
    // Booted two hours ago and still nothing fetched: genuinely stuck.
    expect(isCollectorStale(liveness, NOW, NOW - 120 * MINUTE)).toBe(true);
  });

  it('treats an unparseable last_fetched as never fetched', () => {
    db.prepare(
      'INSERT INTO rss_feeds (id, enabled, fetch_interval, last_fetched) VALUES (?, 1, 30, ?)'
    ).run('bad', 'not-a-date');
    const liveness = readCollectorLiveness(db, 'rss_feeds');

    expect(isCollectorStale(liveness, NOW, NOW - 1 * MINUTE)).toBe(false);
    expect(isCollectorStale(liveness, NOW, NOW - 120 * MINUTE)).toBe(true);
  });
});
