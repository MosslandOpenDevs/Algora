/**
 * Passive Consensus Service
 * SQLite-backed implementation for opt-out approval model
 * LOW risk: auto-approves after 24 hours
 * MID risk: auto-approves after 48 hours
 * HIGH risk: never auto-approves, escalates instead
 */

import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  PassiveConsensusManager,
  type ConsensusStorage,
  type PassiveConsensusItem,
  type PassiveConsensusStatus,
} from '@algora/safe-autonomy';
import type { ActivityService } from '../activity';

// ============================================
// SQLite Storage Implementation
// ============================================

export class SQLiteConsensusStorage implements ConsensusStorage {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS passive_consensus_items (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL UNIQUE,
        document_type TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        review_period_ends_at TEXT NOT NULL,
        auto_approved_at TEXT,
        unreviewed_by_human INTEGER DEFAULT 1,
        vetoes TEXT DEFAULT '[]',
        escalations TEXT DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_passive_consensus_status ON passive_consensus_items(status);
      CREATE INDEX IF NOT EXISTS idx_passive_consensus_doc ON passive_consensus_items(document_id);
      CREATE INDEX IF NOT EXISTS idx_passive_consensus_ends ON passive_consensus_items(review_period_ends_at);
    `);
  }

  private rowToItem(row: any): PassiveConsensusItem {
    return {
      id: row.id,
      documentId: row.document_id,
      documentType: row.document_type,
      riskLevel: row.risk_level,
      status: row.status as PassiveConsensusStatus,
      createdAt: new Date(row.created_at),
      reviewPeriodEndsAt: new Date(row.review_period_ends_at),
      autoApprovedAt: row.auto_approved_at ? new Date(row.auto_approved_at) : undefined,
      unreviewedByHuman: row.unreviewed_by_human === 1,
      vetoes: JSON.parse(row.vetoes || '[]'),
      escalations: JSON.parse(row.escalations || '[]'),
    };
  }

  private itemToRow(item: PassiveConsensusItem): Record<string, unknown> {
    return {
      id: item.id,
      document_id: item.documentId,
      document_type: item.documentType,
      risk_level: item.riskLevel,
      status: item.status,
      created_at: item.createdAt.toISOString(),
      review_period_ends_at: item.reviewPeriodEndsAt.toISOString(),
      auto_approved_at: item.autoApprovedAt?.toISOString() || null,
      unreviewed_by_human: item.unreviewedByHuman ? 1 : 0,
      vetoes: JSON.stringify(item.vetoes),
      escalations: JSON.stringify(item.escalations),
    };
  }

  async save(item: PassiveConsensusItem): Promise<void> {
    const row = this.itemToRow(item);
    this.db.prepare(`
      INSERT INTO passive_consensus_items
      (id, document_id, document_type, risk_level, status, created_at, review_period_ends_at, auto_approved_at, unreviewed_by_human, vetoes, escalations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.document_id, row.document_type, row.risk_level, row.status,
      row.created_at, row.review_period_ends_at, row.auto_approved_at,
      row.unreviewed_by_human, row.vetoes, row.escalations
    );
  }

  async get(id: string): Promise<PassiveConsensusItem | null> {
    const row = this.db.prepare('SELECT * FROM passive_consensus_items WHERE id = ?').get(id);
    return row ? this.rowToItem(row) : null;
  }

  async getByDocumentId(documentId: string): Promise<PassiveConsensusItem | null> {
    const row = this.db.prepare('SELECT * FROM passive_consensus_items WHERE document_id = ?').get(documentId);
    return row ? this.rowToItem(row) : null;
  }

  async getAll(status?: PassiveConsensusStatus): Promise<PassiveConsensusItem[]> {
    const query = status
      ? 'SELECT * FROM passive_consensus_items WHERE status = ? ORDER BY created_at DESC'
      : 'SELECT * FROM passive_consensus_items ORDER BY created_at DESC';
    const rows = status
      ? this.db.prepare(query).all(status)
      : this.db.prepare(query).all();
    return rows.map((row: any) => this.rowToItem(row));
  }

  async getPending(): Promise<PassiveConsensusItem[]> {
    const rows = this.db.prepare(
      'SELECT * FROM passive_consensus_items WHERE status = ? ORDER BY review_period_ends_at ASC'
    ).all('PENDING');
    return rows.map((row: any) => this.rowToItem(row));
  }

  async update(item: PassiveConsensusItem): Promise<void> {
    const row = this.itemToRow(item);
    this.db.prepare(`
      UPDATE passive_consensus_items SET
        status = ?, auto_approved_at = ?, unreviewed_by_human = ?, vetoes = ?, escalations = ?
      WHERE id = ?
    `).run(row.status, row.auto_approved_at, row.unreviewed_by_human, row.vetoes, row.escalations, row.id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM passive_consensus_items WHERE id = ?').run(id);
  }
}

// ============================================
// Passive Consensus Service
// ============================================

export class PassiveConsensusService {
  private db: Database.Database;
  private io: SocketServer;
  private activityService: ActivityService;
  private manager: PassiveConsensusManager;
  private storage: SQLiteConsensusStorage;

  constructor(db: Database.Database, io: SocketServer, activityService: ActivityService) {
    this.db = db;
    this.io = io;
    this.activityService = activityService;

    // Create SQLite storage
    this.storage = new SQLiteConsensusStorage(db);

    // Create manager with SQLite storage
    this.manager = new PassiveConsensusManager(this.storage);

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.manager.on('onCreate', (item) => {
      this.activityService.log('PASSIVE_CONSENSUS', 'info',
        `Passive consensus created for ${item.documentType}: review ends ${item.reviewPeriodEndsAt.toISOString()}`, {
          details: {
            documentId: item.documentId,
            riskLevel: item.riskLevel,
            reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
          },
        }
      );

      this.io.emit('passive-consensus:created', {
        id: item.id,
        documentId: item.documentId,
        documentType: item.documentType,
        riskLevel: item.riskLevel,
        reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    this.manager.on('onApprove', (item) => {
      this.activityService.log('PASSIVE_CONSENSUS', 'info',
        `Document explicitly approved: ${item.documentId}`, {
          details: { documentId: item.documentId, status: item.status },
        }
      );

      this.io.emit('passive-consensus:approved', {
        id: item.id,
        documentId: item.documentId,
        status: item.status,
        unreviewedByHuman: item.unreviewedByHuman,
        timestamp: new Date().toISOString(),
      });
    });

    this.manager.on('onVeto', (item, veto) => {
      this.activityService.log('PASSIVE_CONSENSUS', 'warning',
        `Document vetoed by ${veto.vetoerType}: ${veto.reason}`, {
          details: {
            documentId: item.documentId,
            vetoerId: veto.vetoerId,
            reason: veto.reason,
          },
        }
      );

      this.io.emit('passive-consensus:vetoed', {
        id: item.id,
        documentId: item.documentId,
        veto,
        timestamp: new Date().toISOString(),
      });
    });

    this.manager.on('onEscalate', (item, escalation) => {
      this.activityService.log('PASSIVE_CONSENSUS', 'warning',
        `Document escalated to Director 3: ${escalation.reason}`, {
          details: {
            documentId: item.documentId,
            escalatorId: escalation.escalatorId,
            reason: escalation.reason,
          },
        }
      );

      this.io.emit('passive-consensus:escalated', {
        id: item.id,
        documentId: item.documentId,
        escalation,
        timestamp: new Date().toISOString(),
      });
    });

    this.manager.on('onExpire', (item) => {
      this.activityService.log('PASSIVE_CONSENSUS', 'info',
        `Document auto-approved (${item.riskLevel} risk, review period expired)`, {
          details: {
            documentId: item.documentId,
            riskLevel: item.riskLevel,
            unreviewedByHuman: item.unreviewedByHuman,
          },
        }
      );

      this.io.emit('passive-consensus:auto-approved', {
        id: item.id,
        documentId: item.documentId,
        riskLevel: item.riskLevel,
        unreviewedByHuman: item.unreviewedByHuman,
        autoApprovedAt: item.autoApprovedAt?.toISOString(),
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Create a new passive consensus item for a document/proposal
   */
  async createConsensus(options: {
    documentId: string;
    documentType: string;
    riskLevel: 'LOW' | 'MID' | 'HIGH';
  }): Promise<PassiveConsensusItem> {
    // Check if item already exists
    const existing = await this.manager.getByDocumentId(options.documentId);
    if (existing) {
      return existing;
    }

    return this.manager.create({
      documentId: options.documentId,
      documentType: options.documentType,
      riskLevel: options.riskLevel,
    });
  }

  /**
   * Process expired items and auto-approve them
   * Called periodically by the scheduler
   */
  async processExpiredItems(): Promise<number> {
    const approved = await this.manager.processExpiredItems();
    return approved.length;
  }

  /**
   * Get all pending items
   */
  async getPending(): Promise<PassiveConsensusItem[]> {
    return this.manager.getPending();
  }

  /**
   * Get all items with optional status filter
   */
  async getAll(status?: PassiveConsensusStatus): Promise<PassiveConsensusItem[]> {
    return this.storage.getAll(status);
  }

  /**
   * Get item by document ID
   */
  async getByDocumentId(documentId: string): Promise<PassiveConsensusItem | null> {
    return this.manager.getByDocumentId(documentId);
  }

  /**
   * Check consensus status for a document
   */
  async checkStatus(documentId: string) {
    return this.manager.checkStatus(documentId);
  }

  /**
   * Veto a document
   */
  async veto(documentId: string, vetoerId: string, vetoerType: 'human' | 'agent', reason: string) {
    return this.manager.veto(documentId, vetoerId, vetoerType, reason);
  }

  /**
   * Explicitly approve a document
   */
  async approve(documentId: string, approverId: string, approverType: 'human' | 'agent') {
    return this.manager.approve(documentId, approverId, approverType);
  }

  /**
   * Escalate a document
   */
  async escalate(documentId: string, escalatorId: string, escalatorType: 'human' | 'agent', reason: string) {
    return this.manager.escalate(documentId, escalatorId, escalatorType, reason);
  }

  /**
   * Get the underlying manager
   */
  getManager(): PassiveConsensusManager {
    return this.manager;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    vetoed: number;
    escalated: number;
    autoApproved: number;
  }> {
    const all = await this.storage.getAll();

    return {
      total: all.length,
      pending: all.filter(i => i.status === 'PENDING').length,
      approved: all.filter(i => i.status === 'EXPLICITLY_APPROVED').length,
      vetoed: all.filter(i => i.status === 'VETOED').length,
      escalated: all.filter(i => i.status === 'ESCALATED').length,
      autoApproved: all.filter(i => i.status === 'APPROVED_BY_TIMEOUT').length,
    };
  }
}
