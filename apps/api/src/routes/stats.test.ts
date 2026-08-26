/**
 * The dashboard trend compares like with like.
 *
 * It used to measure today *so far* against the **whole** of yesterday. At
 * 01:00 UTC that reads 93 signals against yesterday's full 1,263 and reports
 * -93%, while the honest comparison — 93 against the 109 collected by 01:00
 * yesterday — is -15%. Collection was flat; the dashboard said it had
 * collapsed. The artifact shrank through the day and only disappeared around
 * midnight, which is exactly when nobody was looking, so the front page
 * announced a crisis every morning and quietly retracted it by night.
 *
 * `dashboardCounts` therefore takes `now` as a parameter instead of using
 * SQLite's `'now'`, so this can pin the boundary rather than hope the suite
 * runs at a convenient hour.
 *
 * Also covered: the two trends that were removed. "Active Agents" and "Active
 * Sessions" show a level — how many right now — and nothing records what that
 * level was yesterday. They were decorated with the day-over-day change in
 * agent_chatter volume and in sessions *created*, so a card reading "10, down
 * 96%" stated something about neither agents nor sessions. An absent arrow is
 * not a missing feature here; it is the only honest answer available.
 */

import express, { type Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSchema } from '../db';
import { statsRouter, dashboardCounts, percentChange } from './stats';
import { cache } from '../lib/cache';

/** 2026-08-23 01:00 UTC — the hour that made the old comparison absurd. */
const NOW = '2026-08-23T01:00:00.000Z';

function seed(db: Database.Database, timestamps: string[]): void {
  // Every NOT NULL column, so a schema change surfaces here rather than as a
  // silently empty fixture.
  const insert = db.prepare(
    `INSERT INTO signals
       (id, original_id, source, timestamp, category, severity, value, unit, description, created_at)
     VALUES (?, ?, 'test', ?, 'market', 'info', 1, 'count', 'seeded', ?)`,
  );
  timestamps.forEach((ts, i) => insert.run(`sig-${i}`, `orig-${i}`, ts, ts));
}

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

describe('percentChange', () => {
  it('reports a fall and a rise', () => {
    expect(percentChange(93, 109)).toBe(-15);
    expect(percentChange(120, 100)).toBe(20);
  });

  it('reports 0 rather than infinity when there is no baseline', () => {
    // Growth from nothing has no percentage; the old code answered 100, which
    // read as a real measured jump.
    expect(percentChange(50, 0)).toBe(0);
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe('dashboardCounts', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('counts yesterday only up to the current time of day', () => {
    seed(db, [
      '2026-08-23T00:30:00.000Z', // today, before now
      '2026-08-22T00:15:00.000Z', // yesterday, before this time of day
      '2026-08-22T00:45:00.000Z', // yesterday, before this time of day
      '2026-08-22T14:00:00.000Z', // yesterday, but later in the day than now
      '2026-08-22T23:59:00.000Z', // yesterday, later still
    ]);

    const counts = dashboardCounts(db, NOW);

    expect(counts.signalsToday).toBe(1);
    // The two afternoon rows are the whole bug: counting them turned a flat
    // day into a reported collapse.
    expect(counts.signalsYesterday).toBe(2);
    expect(percentChange(counts.signalsToday, counts.signalsYesterday)).toBe(-50);
  });

  it('reads flat when both windows match', () => {
    seed(db, [
      '2026-08-23T00:10:00.000Z',
      '2026-08-23T00:20:00.000Z',
      '2026-08-22T00:10:00.000Z',
      '2026-08-22T00:20:00.000Z',
      '2026-08-22T20:00:00.000Z', // excluded: later in the day than now
    ]);

    const counts = dashboardCounts(db, NOW);

    expect(percentChange(counts.signalsToday, counts.signalsYesterday)).toBe(0);
  });

  it('ignores the day before yesterday', () => {
    seed(db, ['2026-08-21T00:30:00.000Z', '2026-08-21T00:40:00.000Z']);

    const counts = dashboardCounts(db, NOW);

    expect(counts.signalsToday).toBe(0);
    expect(counts.signalsYesterday).toBe(0);
  });
});

describe('GET /api/stats', () => {
  let app: Express;

  beforeEach(() => {
    // The route memoises its result; without this the second case would read
    // the first case's database.
    cache.invalidatePattern('stats');
    const db = freshDb();
    app = express();
    app.locals.db = db;
    app.use('/api/stats', statsRouter);
  });

  it('carries a trend only for the card that has a comparable history', async () => {
    const res = await request(app).get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('signalsTrend');
    // Absent, not zero: the UI hides the arrow when the field is undefined,
    // and a 0 would assert "unchanged", which nothing here can know.
    expect(res.body.agentsTrend).toBeUndefined();
    expect(res.body.sessionsTrend).toBeUndefined();
  });

  it('still reports the four headline counts', async () => {
    const res = await request(app).get('/api/stats');

    for (const key of ['activeAgents', 'activeSessions', 'signalsToday', 'openIssues']) {
      expect(res.body).toHaveProperty(key);
    }
  });

  it('reports the roster size, so no page has to guess it', async () => {
    // The live page hard-coded 30 for this, and used the same 30 whenever
    // activeAgents came back 0 — turning a real zero into a fabricated count.
    const res = await request(app).get('/api/stats');

    expect(res.body).toHaveProperty('totalAgents');
    expect(res.body.totalAgents).toBe(0); // empty fixture: zero is a real answer
  });
});
