import { Server as SocketServer } from 'socket.io';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export type ActivityType =
  | 'HEARTBEAT'
  | 'COLLECTOR'
  | 'COLLECTOR_HEALTH'
  | 'NORMALIZE'
  | 'DEDUPE'
  | 'BUDGET_THROTTLE'
  | 'SYSTEM_STATUS'
  | 'AGENT_CHATTER'
  | 'AGENT_SUMMONED'
  | 'AGENT_SPEAKING'
  | 'AGENT_DISMISSED'
  | 'AGORA_SESSION_START'
  | 'AGORA_ROUND_COMPLETE'
  | 'AGORA_SESSION_COMPLETE'
  | 'AGORA_CONSENSUS'
  | 'DECISION_PACKET'
  | 'DISCLOSURE_PUBLISH'
  | 'PIPELINE'
  | 'PIPELINE_RETRY'
  | 'PROPOSAL_BACKFILL'
  | 'SESSION_ESCALATED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'VOTING'
  | 'APPROVAL'
  | 'DOCUMENT'
  | 'PASSIVE_CONSENSUS'
  | 'PROPOSAL_QUEUE'
  | 'VOTING_RESOLUTION'
  | 'AGORA_STALE_CLEANUP'
  | 'AGORA_STALE_HARVEST'
  | 'TREASURY_ALLOCATION_APPROVED'
  | 'TREASURY_DISBURSED'
  | 'TREASURY_TRANSACTION'
  | 'TOKEN_VOTE_CAST'
  | 'TOKEN_VOTING_FINALIZED';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface ActivityRecordInput {
  type: ActivityType;
  severity: Severity;
  message: string;
  agentId?: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Write one row to activity_log.
 *
 * This is the single place that names activity_log's columns. Services used to
 * compose this INSERT themselves and three of them drifted from the schema —
 * writing `description`, or `source`/`level` — so every record they produced was
 * rejected at prepare() time and swallowed by the surrounding catch. Call this
 * instead of writing the statement again.
 */
export function recordActivity(
  db: Database.Database,
  input: ActivityRecordInput
): { id: string; timestamp: string } {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO activity_log (id, type, severity, timestamp, message, agent_id, details, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.type,
    input.severity,
    timestamp,
    input.message,
    input.agentId ?? null,
    input.details ? JSON.stringify(input.details) : null,
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  return { id, timestamp };
}

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  severity: Severity;
  timestamp: string;
  message: string;
  agentId?: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class ActivityService {
  private db: Database.Database;
  private io: SocketServer;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
  }

  log(
    type: ActivityType,
    severity: Severity,
    message: string,
    options?: {
      agentId?: string;
      details?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): ActivityEvent {
    const { id, timestamp } = recordActivity(this.db, {
      type,
      severity,
      message,
      agentId: options?.agentId,
      details: options?.details,
      metadata: options?.metadata,
    });

    const event: ActivityEvent = {
      id,
      type,
      severity,
      timestamp,
      message,
      agentId: options?.agentId,
      details: options?.details,
      metadata: options?.metadata,
    };

    // Broadcast via Socket.IO
    this.io.emit('activity:event', event);

    return event;
  }

  startHeartbeat(intervalMs: number = 60000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.log('HEARTBEAT', 'info', 'System heartbeat', {
        metadata: {
          uptime: process.uptime(),
          memory: process.memoryUsage().heapUsed,
          timestamp: Date.now(),
        },
      });
    }, intervalMs);

    console.info(`Heartbeat started with interval: ${intervalMs}ms`);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.info('Heartbeat stopped');
    }
  }

  getRecent(limit: number = 100): ActivityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM activity_log
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      timestamp: row.timestamp,
      message: row.message,
      agentId: row.agent_id,
      details: row.details ? JSON.parse(row.details) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  broadcastStatus(status: 'running' | 'degraded' | 'maintenance'): void {
    this.io.emit('activity:status', {
      status,
      timestamp: new Date().toISOString(),
    });
  }
}
