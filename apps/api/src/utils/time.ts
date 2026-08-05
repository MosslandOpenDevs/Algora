/**
 * Time helpers for SQLite comparisons.
 *
 * THE TRAP: most timestamp columns in this database are written from JS as
 * `new Date().toISOString()` — `2026-08-05T21:27:40.708Z`, with a `'T'`
 * separator. SQLite's `datetime('now', ...)` renders with a SPACE —
 * `2026-08-05 19:57:40`. Both are TEXT, so `col < datetime('now', '-90
 * minutes')` is a plain string comparison, and `'T'` (0x54) sorts AFTER
 * `' '` (0x20). Any row whose date component equals the cutoff's therefore
 * compares as GREATER regardless of its time, so:
 *
 *   - `<` (staleness/expiry) matches nothing until the UTC date rolls over,
 *     which is how stale Agora sessions survived all day and were then
 *     swept 72-at-once just after midnight;
 *   - `>` (recent-window counts) matches everything from today, inflating
 *     dashboard stats (prod: 3,547 reported vs 2,404 real signals/24h).
 *
 * THE FIX: compare ISO against ISO. ISO-8601 UTC strings sort
 * lexicographically in chronological order, so a bound produced here is
 * both correct and index-friendly (unlike wrapping the column in
 * `datetime(col)`, which defeats the index).
 *
 * Columns written by SQL `DEFAULT CURRENT_TIMESTAMP` (e.g. `issues.created_at`,
 * `signals.created_at`, `trust_updates.created_at`) ARE in SQLite's space
 * format and must keep comparing against `datetime('now', ...)`. Check how a
 * column is written before changing its comparison.
 */

/** Current time as an ISO-8601 UTC string, matching how columns are written. */
export function isoNow(): string {
  return new Date().toISOString();
}

/** ISO-8601 UTC bound `ms` milliseconds in the past. */
export function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** ISO-8601 UTC bound `ms` milliseconds in the future. */
export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** ISO-8601 UTC bound `n` minutes / hours / days in the past. */
export const isoMinutesAgo = (n: number): string => isoAgo(n * MINUTE_MS);
export const isoHoursAgo = (n: number): string => isoAgo(n * HOUR_MS);
export const isoDaysAgo = (n: number): string => isoAgo(n * DAY_MS);
