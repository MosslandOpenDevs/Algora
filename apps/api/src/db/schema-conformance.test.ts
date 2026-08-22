/**
 * Structural guard: no SQL statement in apps/api may name a column that does
 * not exist on the table it reads.
 *
 * This class of bug has now shipped four times, and it always looks the same:
 *
 * - `/api/timeline/issue/:id` selected `round_count` and `completed_at` from
 *   `agora_sessions`; the columns are `current_round` and `concluded_at`.
 * - `/api/outcomes/analytics/agent/:id` counted `agora_messages.speaker_id`;
 *   the column is `agent_id`.
 * - `/api/outcomes/analytics/categories` and the governance report grouped by
 *   `proposals.category`; proposals have no category — it belongs to the issue
 *   they answer, reached through `issue_id`.
 *
 * Every one compiled cleanly, because the row types were hand-written to match
 * the SQL rather than the table, and every one threw SqliteError at request
 * time behind a catch that turned it into a failed response. Nothing was
 * louder than a log line.
 *
 * Two details decide the shape of this guard:
 *
 * - SQLite reports only the FIRST unknown column, so fixing one by hand moves
 *   the error to the next and looks resolved until the next request. Only
 *   prepare() sees the whole statement. `agora_sessions` had two.
 * - Many services create their own tables lazily rather than in
 *   `createSchema()`, so a "no such table" here is that known pattern, not a
 *   typo. Those are counted and reported instead of failing the suite —
 *   otherwise this guard would demand a schema refactor it has no opinion
 *   about, and would have to be scoped so narrowly it stopped catching the
 *   bug it exists for. Columns on tables the canonical schema does define are
 *   checked everywhere under src/.
 *
 * `activity/activity-log.test.ts` carries the same guard shape for
 * hand-written activity_log INSERTs; this is the general form.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { createSchema } from './index';

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

interface Statement {
  file: string;
  sql: string;
}

/**
 * Every template literal under src/ whose text starts with a SQL verb.
 * Statements carrying `${}` are returned separately: their final text is only
 * known at runtime, so prepare() cannot speak for them.
 */
function collectStatements(): { statically: Statement[]; interpolated: Statement[] } {
  const statically: Statement[] = [];
  const interpolated: Statement[] = [];

  for (const file of tsFiles(API_SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const sql = match[1].trim();
      if (!/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) continue;

      const entry = { file: relative(API_SRC, file), sql };
      (sql.includes('${') ? interpolated : statically).push(entry);
    }
  }

  return { statically, interpolated };
}

interface Verdict {
  /** Statements naming a column that does not exist. Always a bug. */
  badColumns: string[];
  /** Tables created by a service rather than by createSchema(). */
  serviceOwnedTables: Set<string>;
}

function check(statements: Statement[]): Verdict {
  const db = freshDb();
  const badColumns: string[] = [];
  const serviceOwnedTables = new Set<string>();

  for (const { file, sql } of statements) {
    try {
      db.prepare(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // better-sqlite3 rejects multi-statement strings; those belong to
      // db.exec() and say nothing about the schema.
      if (message.includes('more than one statement')) continue;

      const missingTable = /no such table:\s*(\S+)/.exec(message);
      if (missingTable) {
        serviceOwnedTables.add(missingTable[1]);
        continue;
      }

      badColumns.push(`${file}: ${message}\n    ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }

  return { badColumns, serviceOwnedTables };
}

describe('SQL in apps/api matches the schema', () => {
  const { statically, interpolated } = collectStatements();

  it('finds statements to check', () => {
    // Guards the collector itself: a regex that stops matching would turn this
    // whole suite green while checking nothing.
    expect(statically.length).toBeGreaterThan(200);
  });

  it('names no column that does not exist', () => {
    expect(check(statically).badColumns).toEqual([]);
  });

  it('pins the columns these queries were fixed to read', () => {
    const db = freshDb();
    const columnsOf = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        c => c.name,
      );

    const sessions = columnsOf('agora_sessions');
    expect(sessions).toContain('current_round');
    expect(sessions).toContain('concluded_at');
    expect(sessions).not.toContain('round_count');
    expect(sessions).not.toContain('completed_at');

    const messages = columnsOf('agora_messages');
    expect(messages).toContain('agent_id');
    expect(messages).not.toContain('speaker_id');

    // Category belongs to the issue, not the proposal — the analytics queries
    // reach it through proposals.issue_id.
    expect(columnsOf('proposals')).not.toContain('category');
    expect(columnsOf('issues')).toContain('category');
  });

  it('reports what this guard cannot reach', () => {
    // Neither number is a failure — both are the guard's visible ceiling.
    // Interpolated statements cannot be prepared ahead of time, and columns on
    // service-created tables cannot be checked against a schema that does not
    // declare them. If either grows, the passing count above is covering
    // proportionally less than it appears to.
    const { serviceOwnedTables } = check(statically);

    expect(interpolated.length).toBeLessThan(statically.length);
    expect(serviceOwnedTables.size).toBeLessThan(statically.length);
  });
});
