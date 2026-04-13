import type Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export type AuditEventType =
  | 'VOTE_CAST'
  | 'VOTE_DELEGATED'
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_SUBMITTED'
  | 'PROPOSAL_CANCELLED'
  | 'PROPOSAL_FINALIZED'
  | 'DELEGATION_CREATED'
  | 'DELEGATION_REVOKED'
  | 'HIGH_RISK_APPROVED'
  | 'BUDGET_EXCEEDED';

export interface AuditEvent {
  type: AuditEventType;
  actor: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  seq: number;
  type: AuditEventType;
  actor: string;
  subject_id: string;
  payload: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

const GENESIS_HASH = '0'.repeat(64);

export class AuditService {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private tailStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log (id, seq, type, actor, subject_id, payload, prev_hash, hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.tailStmt = this.db.prepare(
      'SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1'
    );
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL UNIQUE,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_type ON audit_log(type);
      CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON audit_log(subject_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
    `);
  }

  private computeHash(
    seq: number,
    type: string,
    actor: string,
    subjectId: string,
    payload: string,
    prevHash: string,
    createdAt: string
  ): string {
    const input = [seq, type, actor, subjectId, payload, prevHash, createdAt].join('|');
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Append a governance event to the tamper-evident log. Uses a synchronous
   * transaction so the sequence number / prev_hash read-modify-write cycle
   * can't race under concurrent writes.
   */
  append(event: AuditEvent): AuditEntry {
    return this.db.transaction((): AuditEntry => {
      const tail = this.tailStmt.get() as { seq: number; hash: string } | undefined;
      const seq = (tail?.seq ?? 0) + 1;
      const prevHash = tail?.hash ?? GENESIS_HASH;
      const createdAt = new Date().toISOString();
      const payload = JSON.stringify(event.payload);
      const hash = this.computeHash(
        seq, event.type, event.actor, event.subjectId, payload, prevHash, createdAt
      );
      const id = uuidv4();
      this.insertStmt.run(
        id, seq, event.type, event.actor, event.subjectId, payload, prevHash, hash, createdAt
      );
      return {
        id, seq, type: event.type, actor: event.actor, subject_id: event.subjectId,
        payload, prev_hash: prevHash, hash, created_at: createdAt,
      };
    })();
  }

  /**
   * Walk the chain from genesis and verify every link. Returns the first
   * break (if any) so operators can see which entry was tampered with.
   */
  verify(): { valid: boolean; checked: number; brokenAt?: number; reason?: string } {
    const rows = this.db.prepare(
      'SELECT seq, type, actor, subject_id, payload, prev_hash, hash, created_at FROM audit_log ORDER BY seq ASC'
    ).all() as Array<Omit<AuditEntry, 'id'>>;

    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) {
        return { valid: false, checked: expectedSeq - 1, brokenAt: row.seq, reason: 'sequence gap' };
      }
      if (row.prev_hash !== expectedPrev) {
        return { valid: false, checked: expectedSeq - 1, brokenAt: row.seq, reason: 'prev_hash mismatch' };
      }
      const recomputed = this.computeHash(
        row.seq, row.type, row.actor, row.subject_id, row.payload, row.prev_hash, row.created_at
      );
      if (recomputed !== row.hash) {
        return { valid: false, checked: expectedSeq - 1, brokenAt: row.seq, reason: 'hash mismatch' };
      }
      expectedPrev = row.hash;
      expectedSeq++;
    }
    return { valid: true, checked: rows.length };
  }

  recent(limit = 50): AuditEntry[] {
    return this.db.prepare(
      'SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?'
    ).all(limit) as AuditEntry[];
  }

  getBySubject(subjectId: string): AuditEntry[] {
    return this.db.prepare(
      'SELECT * FROM audit_log WHERE subject_id = ? ORDER BY seq ASC'
    ).all(subjectId) as AuditEntry[];
  }
}
