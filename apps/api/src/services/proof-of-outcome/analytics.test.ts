/**
 * Analytics date filtering.
 *
 * `getGovernanceMetrics` builds one `dateFilter` fragment and interpolates it
 * into two queries with different FROM clauses. It read `AND created_at
 * BETWEEN ? AND ?` unqualified, which is fine against `FROM proposals` but
 * ambiguous against `FROM proposals p LEFT JOIN votes v` — both tables have a
 * `created_at`. So passing a date range threw `ambiguous column name` and took
 * `/api/outcomes/analytics/governance` and the whole governance report
 * (`/analytics/report`, which always passes dates) down with it.
 *
 * `db/schema-conformance.test.ts` cannot see this: the defect lives inside an
 * interpolated fragment, whose final text is only known at runtime, and that
 * guard counts such statements as its declared blind spot rather than
 * checking them. This is what covers that spot for the queries behind it —
 * by running them, which is the only thing that can.
 *
 * The fixture supplements `createSchema()` with the two tables these queries
 * touch that a service creates for itself, mirroring the DDL at their source.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

import { createSchema } from '../../db';
import { AnalyticsService } from './analytics';

/** Mirrors services/governance/voting.ts, which owns this table at runtime. */
const VOTER_REGISTRY_DDL = `
  CREATE TABLE IF NOT EXISTS voter_registry (
    id TEXT PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    display_name TEXT,
    voting_power REAL DEFAULT 1.0,
    total_votes_cast INTEGER DEFAULT 0,
    reputation_score REAL DEFAULT 50.0,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

function fixture(): AnalyticsService {
  const db = new Database(':memory:');
  createSchema(db);
  db.exec(VOTER_REGISTRY_DDL);

  db.prepare(
    `INSERT INTO issues (id, title, description, category, priority, status, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('issue-1', 'Treasury policy', 'desc', 'treasury', 'high', 'open', '2026-03-01T00:00:00.000Z');

  db.prepare(
    `INSERT INTO proposals (id, title, description, proposer, status, issue_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('prop-1', 'Allocate reserve', 'desc', '0xabc', 'passed', 'issue-1', '2026-03-02T00:00:00.000Z');

  db.prepare(
    `INSERT INTO voter_registry (id, address, is_verified) VALUES (?, ?, 1)`,
  ).run('voter-1', '0xabc');

  return new AnalyticsService(db, {} as unknown as SocketServer);
}

describe('AnalyticsService date filtering', () => {
  let analytics: AnalyticsService;

  beforeEach(() => {
    analytics = fixture();
  });

  it('reads governance metrics with no date range', () => {
    const metrics = analytics.getGovernanceMetrics();

    expect(metrics.totalProposals).toBe(1);
    expect(metrics.passedProposals).toBe(1);
  });

  it('reads governance metrics with a date range', () => {
    // The regression: unqualified `created_at` made this throw, while the
    // undated call above kept working, so the failure looked intermittent.
    const metrics = analytics.getGovernanceMetrics('2026-01-01', '2026-12-31');

    expect(metrics.totalProposals).toBe(1);
    expect(metrics.passedProposals).toBe(1);
  });

  it('excludes proposals outside the range rather than ignoring it', () => {
    // Guards the other direction: a filter that is syntactically valid but
    // dropped would leave both assertions above passing.
    const metrics = analytics.getGovernanceMetrics('2020-01-01', '2020-12-31');

    expect(metrics.totalProposals).toBe(0);
  });

  it('exports a governance report over a date range', () => {
    const report = analytics.exportGovernanceReport('2026-01-01', '2026-12-31');

    expect(report.proposals).toHaveLength(1);
    // Category comes from the linked issue — proposals have none of their own.
    expect(report.proposals[0].category).toBe('treasury');
  });

  it('groups category analytics through the linked issue', () => {
    const categories = analytics.getCategoryAnalytics();

    expect(categories).toEqual([
      expect.objectContaining({ category: 'treasury', total: 1, passed: 1 }),
    ]);
  });
});
