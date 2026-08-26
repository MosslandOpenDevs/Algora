/**
 * Correcting a published report.
 *
 * Every report published before 2026-08-26 states `LLM API Calls | 0` and
 * `Uptime | 99.9%`, because `collectSystemMetrics` returned both as constants
 * (see `data-collector.test.ts`). The call figure was wrong by tens of
 * thousands; the uptime was never measured at all.
 *
 * Three properties matter more than the numbers themselves:
 *
 *   1. The period comes from the report, which states it, rather than being
 *      re-derived from the publication date and an assumption about the
 *      generator's window. A report that does not state one is refused —
 *      guessing the window would be the same class of mistake being corrected.
 *   2. The correction is visible. Quietly replacing the body of a published
 *      governance record would be its own failure, whatever the numbers say
 *      afterwards.
 *   3. `dryRun` computes everything and writes nothing, so a correction can be
 *      read before it lands on a published record.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

import { createSchema } from '../../db';
import { ReportGeneratorService } from './index';
import { DisclosureService } from '../disclosure';

const PERIOD_START = '2026-08-17';
const PERIOD_END = '2026-08-24';

/** A published report in the shape the old generator produced. */
const ORIGINAL_BODY = `# Weekly Governance Report

**Period:** Aug 17, 2026 - Aug 24, 2026

## System Status

| Metric | Value |
|--------|-------|
| Uptime | 99.9% |
| LLM API Calls | 0 |
| LLM Cost | $0.00 |
`;

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createSchema(db);

  const insert = db.prepare(
    `INSERT INTO budget_usage (id, provider, tier, date, hour, call_count, estimated_cost_usd)
     VALUES (?, 'ollama', 1, ?, ?, ?, 0)`,
  );
  insert.run('u-1', '2026-08-18', 1, 12000);
  insert.run('u-2', '2026-08-22', 2, 10435);
  // Outside the period: must not be counted.
  insert.run('u-3', '2026-09-05', 3, 99999);

  return db;
}

function services(db: Database.Database) {
  const io = { emit: () => undefined, on: () => undefined } as unknown as SocketServer;
  return {
    reports: new ReportGeneratorService(db, io),
    disclosure: new DisclosureService(db, io),
  };
}

function publish(db: Database.Database, content: string, title = 'Weekly Governance Report - Week 34, 2026') {
  const { disclosure } = services(db);
  const created = disclosure.create({
    title,
    type: 'quarterly',
    date: '2026-08-24T00:00:20.047Z',
    summary: 'original summary',
    content,
    author: 'Algora Report Generator',
  });
  disclosure.publish(created.id);
  return created.id;
}

describe('regenerating a published report', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('reports the calls actually recorded for the period it states', async () => {
    const id = publish(db, ORIGINAL_BODY);

    const result = await services(db).reports.regenerateReport(id, { dryRun: true });

    expect(result.period.start).toContain(PERIOD_START);
    expect(result.period.end).toContain(PERIOD_END);
    // 12,000 + 10,435 — the September row is outside the window.
    expect(result.content).toContain('22,435');
    expect(result.content).not.toMatch(/\| LLM API Calls \| 0 \|/);
  });

  it('says uptime was not measured instead of restating 99.9%', async () => {
    const id = publish(db, ORIGINAL_BODY);

    const { content } = await services(db).reports.regenerateReport(id, { dryRun: true });

    expect(content).toContain('not measured');
    // Asserted on the metrics row, not the whole document: the notice quotes
    // the old figure on purpose, which is how a correction explains itself.
    expect(content).not.toMatch(/\| (?:Platform )?Uptime \| 99\.9% \|/);
  });

  it('carries a visible correction notice', async () => {
    const id = publish(db, ORIGINAL_BODY);

    const { content } = await services(db).reports.regenerateReport(id, { dryRun: true });

    expect(content).toMatch(/^> \*\*Corrected\.\*\*/);
  });

  it('writes nothing on a dry run', async () => {
    const id = publish(db, ORIGINAL_BODY);

    const result = await services(db).reports.regenerateReport(id, { dryRun: true });

    expect(result.written).toBe(false);
    expect(services(db).disclosure.getById(id)?.content).toBe(ORIGINAL_BODY);
  });

  it('replaces the body when not a dry run, keeping the record published', async () => {
    const id = publish(db, ORIGINAL_BODY);

    await services(db).reports.regenerateReport(id);

    const after = services(db).disclosure.getById(id);
    expect(after?.content).not.toBe(ORIGINAL_BODY);
    expect(after?.content).toContain('22,435');
    // Same record: the URL and its published state must survive a correction.
    expect(after?.status).toBe('published');
    expect(after?.date).toBe('2026-08-24T00:00:20.047Z');
  });

  it('refuses a report that does not state its period', async () => {
    const id = publish(db, '# Weekly Governance Report\n\nNo period line here.\n');

    await expect(services(db).reports.regenerateReport(id, { dryRun: true })).rejects.toThrow(
      /does not state its period/,
    );
  });

  it('accepts an explicit period for a report that predates the Period line', async () => {
    // The two monthly reports published before the templates stated one. The
    // caller supplies the window and owns that claim; the default path below
    // still refuses to invent it.
    const id = publish(db, '# Monthly Governance Report\n\n## August 2026\n', 'Monthly Governance Report - August 2026');

    const { content } = await services(db).reports.regenerateReport(id, {
      dryRun: true,
      period: { start: new Date('2026-08-17T00:00:00Z'), end: new Date('2026-08-24T00:00:00Z') },
    });

    expect(content).toContain('22,435');
  });

  it('refuses an id that does not exist', async () => {
    await expect(
      services(db).reports.regenerateReport('no-such-report', { dryRun: true }),
    ).rejects.toThrow(/not found/i);
  });
});
