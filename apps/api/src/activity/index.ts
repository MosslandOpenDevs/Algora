import { Server as SocketServer } from 'socket.io';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export type ActivityType =
  | 'HEARTBEAT'
  | 'COLLECTOR'
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
  | 'VOTING'
  | 'APPROVAL'
  | 'DOCUMENT';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

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
    const event: ActivityEvent = {
      id: uuidv4(),
      type,
      severity,
      timestamp: new Date().toISOString(),
      message,
      agentId: options?.agentId,
      details: options?.details,
      metadata: options?.metadata,
    };

    // Store in database
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, agent_id, details, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.type,
      event.severity,
      event.timestamp,
      event.message,
      event.agentId || null,
      event.details ? JSON.stringify(event.details) : null,
      event.metadata ? JSON.stringify(event.metadata) : null
    );

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
