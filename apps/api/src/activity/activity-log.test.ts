/**
 * Activity logging: the shared writer, plus a structural guard over every
 * hand-written activity_log INSERT in the API.
 *
 * Three services (treasury, token-voting, the social collector) had drifted from
 * the activity_log schema — writing a `description` column, or `source`/`level` —
 * so better-sqlite3 rejected the statement at prepare() time and the surrounding
 * catch swallowed it. Every treasury approval, disbursement, transaction record,
 * token vote and social collection silently lost its activity row. Nothing failed
 * loudly and no test covered it, because the assertions never looked for the row.
 *
 * The guard below compiles the column list of every `INSERT INTO activity_log`
 * found in the source against the real schema, so a future drift fails here
 * whether or not that code path has a behavioural test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { createSchema } from '../db';
import { recordActivity } from './index';

const API_SRC = join(__dirname, '..');

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

/** Production sources only — tests may quote SQL in prose or fixtures. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__')
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface InsertSite {
  file: string;
  columns: string[];
  /** The statement text following the column list, where the VALUES clause lives. */
  valuesClause: string;
}

/** Every `INSERT INTO activity_log (...)` written by hand anywhere in apps/api/src. */
function findActivityLogInserts(): InsertSite[] {
  const sites: InsertSite[] = [];
  const pattern = /INSERT\s+INTO\s+activity_log\s*\(([^)]*)\)/gi;

  for (const file of tsFiles(API_SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(pattern)) {
      const after = source.slice(match.index! + match[0].length);
      sites.push({
        file: relative(API_SRC, file),
        columns: match[1]
          .split(',')
          .map(c => c.trim())
          .filter(Boolean),
        valuesClause: after.slice(0, 300),
      });
    }
  }
  return sites;
}

describe('recordActivity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('writes a row that reads back intact', () => {
    const { id, timestamp } = recordActivity(db, {
      type: 'TREASURY_DISBURSED',
      severity: 'info',
      message: 'Allocation alloc-1 disbursed',
      metadata: { allocationId: 'alloc-1' },
    });

    const row = db
      .prepare('SELECT * FROM activity_log WHERE id = ?')
      .get(id) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.type).toBe('TREASURY_DISBURSED');
    expect(row.severity).toBe('info');
    expect(row.message).toBe('Allocation alloc-1 disbursed');
    expect(row.timestamp).toBe(timestamp);
    expect(JSON.parse(row.metadata as string)).toEqual({
      allocationId: 'alloc-1',
    });
  });

  it('stores optional columns as NULL rather than the string "undefined"', () => {
    const { id } = recordActivity(db, {
      type: 'COLLECTOR',
      severity: 'info',
      message: 'Social: reddit collected 3 signals',
    });

    const row = db
      .prepare('SELECT * FROM activity_log WHERE id = ?')
      .get(id) as Record<string, unknown>;

    expect(row.agent_id).toBeNull();
    expect(row.details).toBeNull();
    expect(row.metadata).toBeNull();
  });

  it('keeps agent_id and details when supplied', () => {
    const { id } = recordActivity(db, {
      type: 'AGENT_SUMMONED',
      severity: 'warning',
      message: 'Agent summoned',
      agentId: 'agent-7',
      details: { reason: 'manual' },
    });

    const row = db
      .prepare('SELECT * FROM activity_log WHERE id = ?')
      .get(id) as Record<string, unknown>;

    expect(row.agent_id).toBe('agent-7');
    expect(JSON.parse(row.details as string)).toEqual({ reason: 'manual' });
  });

  it('gives every row a distinct id', () => {
    const a = recordActivity(db, {
      type: 'HEARTBEAT',
      severity: 'info',
      message: 'a',
    });
    const b = recordActivity(db, {
      type: 'HEARTBEAT',
      severity: 'info',
      message: 'b',
    });

    expect(a.id).not.toBe(b.id);
    expect(db.prepare('SELECT COUNT(*) as n FROM activity_log').get()).toEqual({
      n: 2,
    });
  });
});

describe('activity_log INSERT statements in apps/api/src', () => {
  let db: Database.Database;
  let schemaColumns: Set<string>;
  let requiredColumns: string[];

  beforeEach(() => {
    db = freshDb();
    const info = db.prepare('PRAGMA table_info(activity_log)').all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    schemaColumns = new Set(info.map(c => c.name));
    requiredColumns = info
      .filter(c => c.notnull === 1 && c.dflt_value === null)
      .map(c => c.name);
  });

  it('finds the statements it is meant to guard', () => {
    // A refactor that moves every INSERT behind a helper is fine, but it must not
    // silently reduce this guard to checking nothing.
    expect(findActivityLogInserts().length).toBeGreaterThan(0);
  });

  it('only names columns that activity_log actually has', () => {
    const offenders = findActivityLogInserts()
      .flatMap(site =>
        site.columns
          .filter(column => !schemaColumns.has(column))
          .map(column => `${site.file}: unknown column "${column}"`)
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it('supplies every NOT NULL column that has no default', () => {
    const offenders = findActivityLogInserts()
      .flatMap(site =>
        requiredColumns
          .filter(column => !site.columns.includes(column))
          .map(column => `${site.file}: missing required column "${column}"`)
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it('writes ISO-8601 timestamps, not SQLite datetime values', () => {
    // The feed and search order by `timestamp` as a string. SQLite's
    // CURRENT_TIMESTAMP / datetime('now') render as "YYYY-MM-DD HH:MM:SS", and a
    // space sorts below "T", so within any single day such rows rank beneath every
    // ISO row of that day regardless of when they happened — which pushed
    // HUMAN_REVIEW_REQUIRED to the bottom of the day it was raised.
    const offenders = findActivityLogInserts()
      .filter(site => site.columns.includes('timestamp'))
      .filter(site =>
        /CURRENT_TIMESTAMP|datetime\(\s*'now'\s*\)/i.test(site.valuesClause)
      )
      .map(site => `${site.file}: timestamp uses a SQLite datetime value`)
      .sort();

    expect(offenders).toEqual([]);
  });
});
