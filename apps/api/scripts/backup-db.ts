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
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'algora.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);

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

  const destFile = path.join(BACKUP_DIR, `algora-${timestamp()}.db`);
  const started = Date.now();
  console.log(`[Backup] ${DB_PATH} -> ${destFile}`);

  const db = new Database(DB_PATH, { readonly: true });
  try {
    // better-sqlite3 backup is an async promise that resolves when all pages
    // have been copied. It holds a snapshot view of the source DB so WAL
    // writes in-flight don't corrupt the output.
    await db.backup(destFile);
  } finally {
    db.close();
  }

  const sizeMB = (fs.statSync(destFile).size / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log(`[Backup] Wrote ${sizeMB}MB in ${elapsed}s`);

  if (process.argv.includes('--verify')) {
    const verify = new Database(destFile, { readonly: true });
    try {
      const result = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') {
        console.error(`[Backup] integrity_check FAILED: ${result.integrity_check}`);
        fs.unlinkSync(destFile); // don't keep a corrupt backup
        process.exit(2);
      }
      console.log('[Backup] integrity_check: ok');
    } finally {
      verify.close();
    }
  }

  prune();
}

function prune(): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('algora-') && f.endsWith('.db'));
  let removed = 0;
  for (const f of files) {
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[Backup] Pruned ${removed} file(s) older than ${RETENTION_DAYS} days`);
  }
}

main().catch((err) => {
  console.error('[Backup] Failed:', err);
  process.exit(1);
});
