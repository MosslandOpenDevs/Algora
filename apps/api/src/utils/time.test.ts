import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { isoNow, isoAgo, isoIn, isoMinutesAgo, isoHoursAgo, isoDaysAgo } from './time';

// These tests exist because the ISO-'T' vs datetime('now') mismatch shipped
// to production three times in different subsystems (stale Agora sessions
// surviving all day, the proposal queue lagging a full day per stage, and
// dashboard signal counts inflated ~47%). They pin the failure mode itself
// so a future "simplification" back to datetime('now') fails loudly here.
describe('SQLite timestamp comparison trap', () => {
  it("demonstrates why datetime('now') cannot bound an ISO-'T' column", () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE rows (id TEXT PRIMARY KEY, updated_at TEXT)`);

    // Written the way the app writes timestamps: new Date().toISOString().
    const twoHoursAgo = isoHoursAgo(2);
    db.prepare('INSERT INTO rows (id, updated_at) VALUES (?, ?)').run('stale', twoHoursAgo);

    // Same calendar date as now (the test would be vacuous right after UTC
    // midnight, where the buggy comparison accidentally works).
    const sameUtcDay = twoHoursAgo.slice(0, 10) === isoNow().slice(0, 10);

    const buggy = db
      .prepare("SELECT COUNT(*) c FROM rows WHERE updated_at < datetime('now', '-90 minutes')")
      .get() as { c: number };
    const correct = db
      .prepare('SELECT COUNT(*) c FROM rows WHERE updated_at < ?')
      .get(isoMinutesAgo(90)) as { c: number };

    expect(correct.c).toBe(1); // always finds the stale row
    if (sameUtcDay) {
      // 'T' (0x54) sorts after ' ' (0x20), so the row compares as GREATER
      // than the cutoff no matter how old it is.
      expect(buggy.c).toBe(0);
    }
    db.close();
  });

  it("inflates '>' windows the same way (the dashboard overcount)", () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE rows (id TEXT PRIMARY KEY, ts TEXT)`);
    // 40 hours old: outside a 24h window by any correct measure.
    const old = isoAgo(40 * 60 * 60 * 1000);
    db.prepare('INSERT INTO rows (id, ts) VALUES (?, ?)').run('old', old);

    const correct = db.prepare('SELECT COUNT(*) c FROM rows WHERE ts > ?').get(isoHoursAgo(24)) as { c: number };
    expect(correct.c).toBe(0);

    // The buggy form counts it whenever the cutoff lands on the row's own
    // date — which is exactly what made prod report 3,547 signals/24h
    // against a true 2,404.
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (old.slice(0, 10) === cutoffDate) {
      const buggy = db
        .prepare("SELECT COUNT(*) c FROM rows WHERE ts > datetime('now', '-24 hours')")
        .get() as { c: number };
      expect(buggy.c).toBe(1);
    }
    db.close();
  });

  it('produces bounds that sort chronologically as plain strings', () => {
    expect(isoDaysAgo(1) < isoHoursAgo(1)).toBe(true);
    expect(isoHoursAgo(1) < isoNow()).toBe(true);
    expect(isoNow() < isoIn(60_000)).toBe(true);
    expect(isoMinutesAgo(90) < isoMinutesAgo(30)).toBe(true);
  });

  it('emits the same shape the app writes, so comparisons stay symmetric', () => {
    expect(isoNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(isoAgo(1000)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
