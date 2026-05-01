#!/usr/bin/env node
/**
 * SQLite online backup.
 *
 * Uses better-sqlite3's backup() which is WAL-safe — other writers keep
 * working while the snapshot is taken. Output lands in
 * ./data/backups/algora-YYYYMMDD-HHMM.db and the script prunes files older
 * than BACKUP_RETENTION_DAYS (default 14).
 *
 * Usage:
 *   pnpm backup            # one-shot
 *   pnpm backup --verify   # also opens the backup and runs PRAGMA integrity_check
 *
 * Intended to be run from a cron/pm2 scheduled task (e.g. hourly).
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'algora.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
// Hourly retention: keep every backup for this many days (default 2 = 48 hourly snapshots).
const HOURLY_RETENTION_DAYS = parseInt(process.env.BACKUP_HOURLY_RETENTION_DAYS || '2', 10);
// Daily retention: beyond hourly window, keep one snapshot per day for this many days.
const DAILY_RETENTION_DAYS = parseInt(process.env.BACKUP_DAILY_RETENTION_DAYS || '7', 10);
// Gzip the snapshot in place. SQLite files compress ~4× because most rows are
// JSON text, so on a 1 GB DB this turns 24 hourly backups (~24 GB) into ~6 GB.
const COMPRESS = (process.env.BACKUP_COMPRESS ?? 'true') !== 'false';
// Skip the new snapshot entirely when its content hash matches the previous
// one. Hourly snapshots of an idle DB are mostly identical, so this avoids
// 100MB writes for zero new state.
const DEDUPE = (process.env.BACKUP_DEDUPE ?? 'true') !== 'false';

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function main(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[Backup] Source DB not found: ${DB_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Snapshot lands at .db first so we can run integrity_check / hash / dedupe,
  // then it's gzipped and the raw .db is deleted. Net result is one .db.gz.
  const stamp = timestamp();
  const tmpFile = path.join(BACKUP_DIR, `algora-${stamp}.db`);
  const destFile = COMPRESS ? `${tmpFile}.gz` : tmpFile;
  const started = Date.now();
  console.log(`[Backup] ${DB_PATH} -> ${destFile}`);

  const db = new Database(DB_PATH, { readonly: true });
  try {
    // better-sqlite3 backup is an async promise that resolves when all pages
    // have been copied. It holds a snapshot view of the source DB so WAL
    // writes in-flight don't corrupt the output.
    await db.backup(tmpFile);
  } finally {
    db.close();
  }

  if (process.argv.includes('--verify')) {
    const verify = new Database(tmpFile, { readonly: true });
    try {
      const result = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') {
        console.error(`[Backup] integrity_check FAILED: ${result.integrity_check}`);
        fs.unlinkSync(tmpFile);
        try { fs.unlinkSync(`${tmpFile}-shm`); } catch { /* may not exist */ }
        try { fs.unlinkSync(`${tmpFile}-wal`); } catch { /* may not exist */ }
        process.exit(2);
      }
      console.log('[Backup] integrity_check: ok');
    } finally {
      verify.close();
    }
  }
  // Verify-open leaves .db-shm/.db-wal next to the snapshot; remove them so
  // the next prune doesn't have to.
  try { fs.unlinkSync(`${tmpFile}-shm`); } catch { /* may not exist */ }
  try { fs.unlinkSync(`${tmpFile}-wal`); } catch { /* may not exist */ }

  // Dedupe against the most recent prior snapshot. If nothing meaningful has
  // changed (e.g. idle hour), drop the redundant copy and let prune keep the
  // older one. Saves ~100 MB per skipped hour.
  if (DEDUPE) {
    const prior = mostRecentSnapshot(tmpFile);
    if (prior && (await sameContent(tmpFile, prior))) {
      fs.unlinkSync(tmpFile);
      // Touch the prior so retention still treats it as "current".
      const now = new Date();
      fs.utimesSync(prior, now, now);
      console.log(`[Backup] Identical to ${path.basename(prior)} — skipped (no new state)`);
      prune();
      return;
    }
  }

  if (COMPRESS) {
    await pipeline(
      fs.createReadStream(tmpFile),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(destFile)
    );
    fs.unlinkSync(tmpFile);
  }

  const sizeMB = (fs.statSync(destFile).size / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log(`[Backup] Wrote ${sizeMB} MB in ${elapsed}s${COMPRESS ? ' (gzip)' : ''}`);

  prune();
}

function mostRecentSnapshot(excluding: string): string | null {
  const excludeBase = path.basename(excluding);
  const candidates = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f !== excludeBase && f.startsWith('algora-') && (f.endsWith('.db') || f.endsWith('.db.gz')))
    .map((f) => ({ name: f, full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.full ?? null;
}

async function sameContent(a: string, b: string): Promise<boolean> {
  // Cheap check first: if sizes differ wildly the files cannot match.
  // (Compressed files won't share an exact byte size with raw, and that's
  // fine — sameContent is only called between raw .db files when DEDUPE
  // matters; gzip files fall through and we'd run a full hash.)
  if (a.endsWith('.db') && b.endsWith('.db')) {
    const sa = fs.statSync(a).size;
    const sb = fs.statSync(b).size;
    if (Math.abs(sa - sb) > sa * 0.01) return false; // >1% size delta = different
  }
  return (await sha256(a)) === (await sha256(b));
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(file);
  if (file.endsWith('.gz')) {
    await pipeline(stream, zlib.createGunzip(), async function* (src) {
      for await (const chunk of src) hash.update(chunk as Buffer);
    });
  } else {
    for await (const chunk of stream) hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function prune(): void {
  const now = Date.now();
  const hourlyCutoff = now - HOURLY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const dailyCutoff = now - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const all = fs.readdirSync(BACKUP_DIR);

  // 1) Remove orphan SQLite sidecars (-shm, -wal). better-sqlite3's verify-open
  // can leave 0-byte sidecars next to the snapshot; without this they accumulate.
  let sidecarRemoved = 0;
  for (const f of all) {
    if (f.endsWith('.db-shm') || f.endsWith('.db-wal')) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        sidecarRemoved++;
      } catch { /* race with concurrent writer */ }
    }
  }

  // 2) Tiered retention for the actual snapshots (.db and .db.gz).
  // Inside hourlyCutoff: keep all. Between hourly and daily: keep one per day.
  // Beyond dailyCutoff: remove.
  const dbFiles = all
    .filter((f) => f.startsWith('algora-') && (f.endsWith('.db') || f.endsWith('.db.gz')))
    .map((f) => ({ name: f, full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  const keptByDay = new Set<string>();
  let removed = 0;
  for (const file of dbFiles) {
    if (file.mtime < dailyCutoff) {
      fs.unlinkSync(file.full);
      removed++;
      continue;
    }
    if (file.mtime < hourlyCutoff) {
      const dayKey = new Date(file.mtime).toISOString().slice(0, 10);
      if (keptByDay.has(dayKey)) {
        fs.unlinkSync(file.full);
        removed++;
      } else {
        keptByDay.add(dayKey);
      }
    }
  }

  if (removed > 0 || sidecarRemoved > 0) {
    console.log(
      `[Backup] Pruned ${removed} snapshot(s) (hourly=${HOURLY_RETENTION_DAYS}d, daily=${DAILY_RETENTION_DAYS}d), ${sidecarRemoved} sidecar(s)`
    );
  }
}

main().catch((err) => {
  console.error('[Backup] Failed:', err);
  process.exit(1);
});
