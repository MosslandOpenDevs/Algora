/**
 * Published reports must not state numbers nobody measured.
 *
 * `collectSystemMetrics` returned three constants — `uptime: 99.9`,
 * `llmCalls: 0`, `llmCost: 0` — with a comment saying real metrics would need
 * a table that "may not exist". The table existed: `budget_usage` has recorded
 * every call since 2026-06-17.
 *
 * The consequence was not internal. The disclosure published on 2026-08-24
 * reads:
 *
 *     | Uptime        | 99.9% |
 *     | LLM API Calls | 0     |
 *
 * against 70,493 calls actually made, and the monthly template turns the same
 * zero into prose about "cost-effective AI utilization". A governance record
 * asserting a measurement that never happened is worse than one that says it
 * does not know.
 *
 * So: usage comes from the ledger, and uptime stays `null` — nothing records
 * downtime, so any percentage would be invented. The templates print
 * "— (not measured)" and withhold the grade rather than award "✅ Excellent"
 * to an absent number.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

import { createSchema } from '../../db';
import { DataCollector } from './data-collector';

const START = new Date('2026-08-01T00:00:00.000Z');
const END = new Date('2026-08-31T23:59:59.000Z');

function seedUsage(
  db: Database.Database,
  rows: Array<{ date: string; calls: number; cost?: number; hour?: number }>,
): void {
  const insert = db.prepare(
    `INSERT INTO budget_usage (id, provider, tier, date, hour, call_count, estimated_cost_usd)
     VALUES (?, 'ollama', 1, ?, ?, ?, ?)`,
  );
  rows.forEach((r, i) => insert.run(`u-${i}`, r.date, r.hour ?? i, r.calls, r.cost ?? 0));
}

function collector(db: Database.Database): DataCollector {
  return new DataCollector(db);
}

describe('report system metrics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
  });

  it('counts the LLM calls actually recorded for the period', () => {
    seedUsage(db, [
      { date: '2026-08-10', calls: 1200 },
      { date: '2026-08-20', calls: 800 },
    ]);

    const { system } = collector(db).collectMetrics(START, END, 'monthly');

    // The old code answered 0 here however busy the system had been.
    expect(system.llmCalls).toBe(2000);
  });

  it('excludes usage outside the period', () => {
    seedUsage(db, [
      { date: '2026-07-31', calls: 500 }, // before
      { date: '2026-08-15', calls: 300 }, // inside
      { date: '2026-09-01', calls: 700 }, // after
    ]);

    expect(collector(db).collectMetrics(START, END, 'monthly').system.llmCalls).toBe(300);
  });

  it('sums real cost, and reports zero cost as zero', () => {
    seedUsage(db, [
      { date: '2026-08-05', calls: 10, cost: 0.25 },
      { date: '2026-08-06', calls: 10, cost: 0.75 },
    ]);

    expect(collector(db).collectMetrics(START, END, 'monthly').system.llmCost).toBeCloseTo(1.0, 5);
  });

  it('reports no calls as zero rather than failing', () => {
    const { system } = collector(db).collectMetrics(START, END, 'weekly');

    // Zero is a real answer when the ledger is empty — the objection was never
    // to the number, only to stating it without looking.
    expect(system.llmCalls).toBe(0);
    expect(system.llmCost).toBe(0);
  });

  it('leaves uptime unmeasured instead of asserting 99.9%', () => {
    seedUsage(db, [{ date: '2026-08-10', calls: 1 }]);

    expect(collector(db).collectMetrics(START, END, 'monthly').system.uptime).toBeNull();
  });
});
