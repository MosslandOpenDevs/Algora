/**
 * Structural guard: no SQL statement in apps/api may name a column or table
 * that does not exist.
 *
 * This class of bug has shipped four times, and it always looks the same:
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
 * SQLite reports only the FIRST unknown column, so fixing one by hand moves the
 * error to the next and looks resolved until the next request. Only prepare()
 * sees the whole statement. `agora_sessions` had two.
 *
 * Two decisions give this guard its reach:
 *
 * - The schema is assembled from every `CREATE TABLE` / `CREATE INDEX` written
 *   under src/, not from `createSchema()` alone. About a dozen services declare
 *   their own tables at construction time, and checking against the canonical
 *   schema alone left 138 statements unverifiable. Reading the DDL where it
 *   actually lives closes that gap without moving a line of production code:
 *   services keep owning their tables, and every column still gets checked.
 * - Statements are collected from quoted strings as well as template literals.
 *   153 statements — 22% of the total, across 35 files — are written in single
 *   quotes and were invisible while this only read backticks.
 *
 * `activity/activity-log.test.ts` carries the same guard shape for hand-written
 * activity_log INSERTs; this is the general form.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const API_SRC = join(__dirname, '..');

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

const STARTS_SQL = /^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;
const DECLARES_SCHEMA = /CREATE\s+(TABLE|INDEX)/i;

/** Backtick, single-quoted and double-quoted string literals in a source file. */
function* stringLiterals(source: string): Generator<{ text: string; templated: boolean }> {
  for (const m of source.matchAll(/`([^`]*)`/g)) yield { text: m[1], templated: true };
  for (const m of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) yield { text: m[1], templated: false };
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) yield { text: m[1], templated: false };
}

/**
 * A database carrying every table the codebase declares.
 *
 * DDL is read from source rather than executed through `createSchema()` plus a
 * dozen service constructors, which would mean constructing those services —
 * each with its own dependencies — just to learn what tables they make.
 * `createSchema()`'s own statements live under src/ too, so the same pass
 * collects them.
 */
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  const failures: string[] = [];

  for (const file of tsFiles(API_SRC)) {
    for (const { text } of stringLiterals(readFileSync(file, 'utf-8'))) {
      if (!DECLARES_SCHEMA.test(text) || text.includes('${')) continue;

      // A single literal often declares several tables and their indexes.
      for (const statement of text.split(';')) {
        if (!DECLARES_SCHEMA.test(statement)) continue;
        try {
          db.exec(`${statement.trim()};`);
        } catch (error) {
          failures.push(
            `${relative(API_SRC, file)}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Schema could not be assembled:\n${failures.join('\n')}`);
  }

  return db;
}

interface Statement {
  file: string;
  sql: string;
}

/**
 * Every statement whose text starts with a SQL verb, split by whether prepare()
 * can speak for it. A template literal carrying `${}` has no final text until
 * runtime; quoted strings never do, so they are always checkable.
 */
function collectStatements(): { checkable: Statement[]; interpolated: Statement[] } {
  const checkable: Statement[] = [];
  const interpolated: Statement[] = [];

  for (const file of tsFiles(API_SRC)) {
    for (const { text, templated } of stringLiterals(readFileSync(file, 'utf-8'))) {
      const sql = text.trim();
      if (!STARTS_SQL.test(sql)) continue;

      const entry = { file: relative(API_SRC, file), sql };
      (templated && sql.includes('${') ? interpolated : checkable).push(entry);
    }
  }

  return { checkable, interpolated };
}

interface Verdict {
  /** Statements naming a column or table that does not exist. Always a bug. */
  schemaErrors: string[];
  /**
   * Statements prepare() rejected for a reason that is not about the schema:
   * a multi-statement string bound for db.exec(), or one half of a SQL string
   * assembled by concatenation. Counted rather than asserted on.
   */
  unparseable: number;
}

function check(statements: Statement[]): Verdict {
  const db = freshDb();
  const schemaErrors: string[] = [];
  let unparseable = 0;

  for (const { file, sql } of statements) {
    try {
      db.prepare(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/no such (column|table)/.test(message)) {
        schemaErrors.push(`${file}: ${message}\n    ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
      } else {
        unparseable++;
      }
    }
  }

  return { schemaErrors, unparseable };
}

describe('SQL in apps/api matches the schema', () => {
  const { checkable, interpolated } = collectStatements();

  it('finds statements to check', () => {
    // Guards the collector itself: a regex that stopped matching would turn
    // this whole suite green while checking nothing.
    expect(checkable.length).toBeGreaterThan(500);
  });

  it('assembles a schema wide enough to check against', () => {
    // Same guard for the DDL pass. A partial match could let a whole file's
    // tables go missing, and every statement touching them would then fail as
    // "no such table" — loudly, but for the wrong reason.
    const tables = freshDb()
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'`)
      .get() as { n: number };

    expect(tables.n).toBeGreaterThan(50);
  });

  it('names no column or table that does not exist', () => {
    expect(check(checkable).schemaErrors).toEqual([]);
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
    // Not a failure — the guard's remaining ceiling, kept visible so nobody
    // reads the passing count above as total coverage. Interpolated statements
    // have no final text until runtime; that is where the `ambiguous column
    // name` defect in analytics lived, and why
    // `services/proof-of-outcome/analytics.test.ts` runs those queries instead.
    const { unparseable } = check(checkable);

    expect(interpolated.length).toBeLessThan(checkable.length / 10);
    expect(unparseable).toBeLessThan(checkable.length / 50);
  });
});
