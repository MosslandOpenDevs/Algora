/**
 * Structural guard: every static SQL statement in the HTTP layer must compile
 * against the real schema.
 *
 * `/api/timeline/issue/:id` selected `round_count` and `completed_at` from
 * `agora_sessions`. Neither column has ever existed — the table has
 * `current_round` and `concluded_at`, and no migration ever created the other
 * two. TypeScript is happy (the row type was hand-written to match the SQL,
 * not the table), so this reached production and threw SqliteError on every
 * request: the timeline 500'd for all 2,553 issues that have a session.
 *
 * Two properties make this class of bug worth a guard rather than a one-off fix:
 *
 * - SQLite reports only the FIRST unknown column, so fixing by hand moves the
 *   error to the next one and looks resolved until the next request. Only
 *   prepare() sees the whole statement.
 * - The failure is invisible to type-checking and to any test that does not
 *   exercise the exact route, which is why `activity-log.test.ts` already
 *   carries the same guard shape for hand-written activity_log INSERTs. This
 *   generalizes it: all statements, all verbs, across the route layer.
 *
 * Scope note: statements built with `${}` interpolation cannot be prepared
 * without knowing the runtime value, so they are reported as skipped rather
 * than silently dropped — a route that moves its columns into an interpolated
 * string leaves this guard, and the count below says so.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { createSchema } from '../db';

const ROUTES_DIR = __dirname;

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
 * Every template literal in the route layer whose text starts with a SQL verb.
 * Statements carrying `${}` are returned separately: their final text is only
 * known at runtime, so prepare() cannot speak for them.
 */
function collectStatements(): { statically: Statement[]; interpolated: Statement[] } {
  const statically: Statement[] = [];
  const interpolated: Statement[] = [];

  for (const file of tsFiles(ROUTES_DIR)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const sql = match[1].trim();
      if (!/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) continue;

      const entry = { file: relative(ROUTES_DIR, file), sql };
      // eslint-disable-next-line no-template-curly-in-string
      (sql.includes('${') ? interpolated : statically).push(entry);
    }
  }

  return { statically, interpolated };
}

describe('route SQL matches the schema', () => {
  const { statically, interpolated } = collectStatements();

  it('finds statements to check', () => {
    // Guards the collector itself: a regex that stops matching would turn this
    // whole suite green while checking nothing.
    expect(statically.length).toBeGreaterThan(20);
  });

  it('prepares every static statement against a fresh schema', () => {
    const db = freshDb();
    const failures: string[] = [];

    for (const { file, sql } of statically) {
      try {
        db.prepare(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // better-sqlite3 rejects multi-statement strings; those belong to
        // db.exec() and are not a schema problem.
        if (message.includes('more than one statement')) continue;
        failures.push(`${file}: ${message}\n    ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('pins the agora_sessions columns the timeline route reads', () => {
    // The specific regression: these are the real names, and the two that
    // shipped instead must stay absent so a revert cannot pass quietly.
    const db = freshDb();
    const columns = (
      db.prepare('PRAGMA table_info(agora_sessions)').all() as Array<{ name: string }>
    ).map(c => c.name);

    expect(columns).toContain('current_round');
    expect(columns).toContain('concluded_at');
    expect(columns).not.toContain('round_count');
    expect(columns).not.toContain('completed_at');
  });

  it('reports how much of the route layer this guard cannot reach', () => {
    // Not a failure — a visible ceiling. If this grows, the guard is covering
    // proportionally less than the passing count above suggests.
    expect(interpolated.length).toBeLessThan(statically.length);
  });
});
