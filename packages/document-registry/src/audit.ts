// ===========================================
// Audit Trail for Algora v2.0
// ===========================================

import type {
  AuditEntry,
  AuditAction,
  AuditActor,
  DocumentState,
  DocumentRegistryConfig,
} from './types.js';
import { DEFAULT_DOCUMENT_REGISTRY_CONFIG } from './types.js';

/**
 * Query filters for audit entries.
 */
export interface AuditQuery {
  documentId?: string;
  action?: AuditAction | AuditAction[];
  actorId?: string;
  actorType?: 'agent' | 'human' | 'system';
  after?: Date;
  before?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Query result for audit entries.
 */
export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

/**
 * Audit summary for a document.
 */
export interface AuditSummary {
  documentId: string;
  totalEvents: number;
  eventsByAction: Record<AuditAction, number>;
  eventsByActorType: Record<string, number>;
  firstEvent?: AuditEntry;
  lastEvent?: AuditEntry;
  stateChanges: { from: DocumentState; to: DocumentState; timestamp: Date }[];
}

/**
 * Storage interface for audit entries.
 */
export interface AuditStorage {
  save(entry: AuditEntry): Promise<void>;
  get(id: string): Promise<AuditEntry | null>;
  query(query: AuditQuery): Promise<AuditQueryResult>;
  getByDocument(documentId: string): Promise<AuditEntry[]>;
  getByActor(actorId: string): Promise<AuditEntry[]>;
  delete(id: string): Promise<void>;
  deleteByDocument(documentId: string): Promise<void>;
  deleteOlderThan(date: Date): Promise<number>;
}

/**
 * In-memory audit storage implementation.
 */
export class InMemoryAuditStorage implements AuditStorage {
  private entries: Map<string, AuditEntry> = new Map();
  private documentIndex: Map<string, string[]> = new Map();
  private actorIndex: Map<string, string[]> = new Map();

  async save(entry: AuditEntry): Promise<void> {
    this.entries.set(entry.id, entry);

    // Update document index
    const docEntries = this.documentIndex.get(entry.documentId) || [];
    docEntries.push(entry.id);
    this.documentIndex.set(entry.documentId, docEntries);

    // Update actor index
    const actorEntries = this.actorIndex.get(entry.actor.id) || [];
    actorEntries.push(entry.id);
    this.actorIndex.set(entry.actor.id, actorEntries);
  }

  async get(id: string): Promise<AuditEntry | null> {
    return this.entries.get(id) || null;
  }

  async query(query: AuditQuery): Promise<AuditQueryResult> {
    let results = Array.from(this.entries.values());

    // Apply filters
    if (query.documentId) {
      results = results.filter((e) => e.documentId === query.documentId);
    }

    if (query.action) {
      const actions = Array.isArray(query.action)
        ? query.action
        : [query.action];
      results = results.filter((e) => actions.includes(e.action));
    }

    if (query.actorId) {
      results = results.filter((e) => e.actor.id === query.actorId);
    }

    if (query.actorType) {
      results = results.filter((e) => e.actor.type === query.actorType);
    }

    if (query.after) {
      results = results.filter((e) => e.timestamp >= query.after!);
    }

    if (query.before) {
      results = results.filter((e) => e.timestamp <= query.before!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Paginate
    const total = results.length;
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      entries: paginatedResults,
      total,
      hasMore: offset + limit < total,
    };
  }

  async getByDocument(documentId: string): Promise<AuditEntry[]> {
    const entryIds = this.documentIndex.get(documentId) || [];
    return entryIds
      .map((id) => this.entries.get(id))
      .filter((e): e is AuditEntry => e !== undefined)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getByActor(actorId: string): Promise<AuditEntry[]> {
    const entryIds = this.actorIndex.get(actorId) || [];
    return entryIds
      .map((id) => this.entries.get(id))
      .filter((e): e is AuditEntry => e !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async delete(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;

    this.entries.delete(id);

    // Update document index
    const docEntries = this.documentIndex.get(entry.documentId) || [];
    this.documentIndex.set(
      entry.documentId,
      docEntries.filter((e) => e !== id)
    );

    // Update actor index
    const actorEntries = this.actorIndex.get(entry.actor.id) || [];
    this.actorIndex.set(
      entry.actor.id,
      actorEntries.filter((e) => e !== id)
    );
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const entryIds = this.documentIndex.get(documentId) || [];
    for (const id of entryIds) {
      await this.delete(id);
    }
    this.documentIndex.delete(documentId);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    let count = 0;
    for (const [id, entry] of this.entries) {
      if (entry.timestamp < date) {
        await this.delete(id);
        count++;
      }
    }
    return count;
  }
}

/**
 * Options for the audit manager.
 */
export interface AuditManagerOptions {
  config?: DocumentRegistryConfig;
  storage?: AuditStorage;
}

/**
 * Audit Manager for tracking document changes.
 */
export class AuditManager {
  private config: DocumentRegistryConfig;
  private storage: AuditStorage;

  constructor(options?: AuditManagerOptions) {
    this.config = options?.config || DEFAULT_DOCUMENT_REGISTRY_CONFIG;
    this.storage = options?.storage || new InMemoryAuditStorage();
  }

  /**
   * Log an audit entry.
   */
  async log(
    documentId: string,
    action: AuditAction,
    actor: AuditActor,
    options?: {
      previousState?: DocumentState;
      newState?: DocumentState;
      contentHashBefore?: string;
      contentHashAfter?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: this.generateId(),
      documentId,
      action,
      actor,
      timestamp: new Date(),
      previousState: options?.previousState,
      newState: options?.newState,
      contentHashBefore: options?.contentHashBefore,
      contentHashAfter: options?.contentHashAfter,
      metadata: options?.metadata || {},
    };

    await this.storage.save(entry);
    return entry;
  }

  /**
   * Log document creation.
   */
  async logCreated(
    documentId: string,
    actor: AuditActor,
    contentHash: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'created', actor, {
      newState: 'draft',
      contentHashAfter: contentHash,
      metadata,
    });
  }

  /**
   * Log document update.
   */
  async logUpdated(
    documentId: string,
    actor: AuditActor,
    contentHashBefore: string,
    contentHashAfter: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'updated', actor, {
      contentHashBefore,
      contentHashAfter,
      metadata,
    });
  }

  /**
   * Log state change.
   */
  async logStateChanged(
    documentId: string,
    actor: AuditActor,
    previousState: DocumentState,
    newState: DocumentState,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'state_changed', actor, {
      previousState,
      newState,
      metadata,
    });
  }

  /**
   * Log review.
   */
  async logReviewed(
    documentId: string,
    actor: AuditActor,
    reviewAction: 'approve' | 'reject' | 'request_changes' | 'escalate',
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'reviewed', actor, {
      metadata: { reviewAction, ...metadata },
    });
  }

  /**
   * Log approval.
   */
  async logApproved(
    documentId: string,
    actor: AuditActor,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'approved', actor, { metadata });
  }

  /**
   * Log rejection.
   */
  async logRejected(
    documentId: string,
    actor: AuditActor,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'rejected', actor, {
      metadata: { reason, ...metadata },
    });
  }

  /**
   * Log publication.
   */
  async logPublished(
    documentId: string,
    actor: AuditActor,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'published', actor, {
      previousState: 'approved',
      newState: 'published',
      metadata,
    });
  }

  /**
   * Log access (if configured).
   */
  async logAccessed(
    documentId: string,
    actor: AuditActor,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry | null> {
    if (!this.config.logAccess) return null;
    return this.log(documentId, 'accessed', actor, { metadata });
  }

  /**
   * Log export.
   */
  async logExported(
    documentId: string,
    actor: AuditActor,
    format: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'exported', actor, {
      metadata: { format, ...metadata },
    });
  }

  /**
   * Log deletion.
   */
  async logDeleted(
    documentId: string,
    actor: AuditActor,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'deleted', actor, { metadata });
  }

  /**
   * Log restoration.
   */
  async logRestored(
    documentId: string,
    actor: AuditActor,
    metadata?: Record<string, unknown>
  ): Promise<AuditEntry> {
    return this.log(documentId, 'restored', actor, { metadata });
  }

  /**
   * Get a specific audit entry.
   */
  async get(id: string): Promise<AuditEntry | null> {
    return this.storage.get(id);
  }

  /**
   * Query audit entries.
   */
  async query(query: AuditQuery): Promise<AuditQueryResult> {
    return this.storage.query(query);
  }

  /**
   * Get audit history for a document.
   */
  async getDocumentHistory(documentId: string): Promise<AuditEntry[]> {
    return this.storage.getByDocument(documentId);
  }

  /**
   * Get audit history for an actor.
   */
  async getActorHistory(actorId: string): Promise<AuditEntry[]> {
    return this.storage.getByActor(actorId);
  }

  /**
   * Get audit summary for a document.
   */
  async getSummary(documentId: string): Promise<AuditSummary> {
    const entries = await this.getDocumentHistory(documentId);

    const eventsByAction: Record<AuditAction, number> = {
      created: 0,
      updated: 0,
      state_changed: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      published: 0,
      accessed: 0,
      exported: 0,
      deleted: 0,
      restored: 0,
    };

    const eventsByActorType: Record<string, number> = {
      agent: 0,
      human: 0,
      system: 0,
    };

    const stateChanges: {
      from: DocumentState;
      to: DocumentState;
      timestamp: Date;
    }[] = [];

    for (const entry of entries) {
      eventsByAction[entry.action]++;
      eventsByActorType[entry.actor.type]++;

      if (
        entry.action === 'state_changed' &&
        entry.previousState &&
        entry.newState
      ) {
        stateChanges.push({
          from: entry.previousState,
          to: entry.newState,
          timestamp: entry.timestamp,
        });
      }
    }

    return {
      documentId,
      totalEvents: entries.length,
      eventsByAction,
      eventsByActorType,
      firstEvent: entries[0],
      lastEvent: entries[entries.length - 1],
      stateChanges,
    };
  }

  /**
   * Export audit trail for a document.
   */
  async exportAuditTrail(
    documentId: string,
    format: 'json' | 'csv'
  ): Promise<string> {
    const entries = await this.getDocumentHistory(documentId);

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // CSV format
    const headers = [
      'id',
      'timestamp',
      'action',
      'actor_id',
      'actor_type',
      'previous_state',
      'new_state',
      'content_hash_before',
      'content_hash_after',
    ];

    const rows = entries.map((e) =>
      [
        e.id,
        e.timestamp.toISOString(),
        e.action,
        e.actor.id,
        e.actor.type,
        e.previousState || '',
        e.newState || '',
        e.contentHashBefore || '',
        e.contentHashAfter || '',
      ].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Cleanup old audit entries.
   */
  async cleanup(): Promise<number> {
    const retentionDays = this.config.auditRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return this.storage.deleteOlderThan(cutoffDate);
  }

  /**
   * Verify audit trail integrity.
   */
  async verifyIntegrity(documentId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const entries = await this.getDocumentHistory(documentId);
    const issues: string[] = [];

    // Check timestamp ordering
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].timestamp < entries[i - 1].timestamp) {
        issues.push(
          `Entry ${entries[i].id} timestamp is before previous entry`
        );
      }
    }

    // Check for creation entry
    const hasCreation = entries.some((e) => e.action === 'created');
    if (!hasCreation) {
      issues.push('No creation entry found');
    }

    // Check state transition validity
    const stateEntries = entries.filter((e) => e.action === 'state_changed');
    for (const entry of stateEntries) {
      if (!entry.previousState || !entry.newState) {
        issues.push(
          `State change entry ${entry.id} missing previous or new state`
        );
      }
    }

    // Check content hash chain
    let lastHash: string | undefined;
    for (const entry of entries) {
      if (entry.contentHashBefore && lastHash && entry.contentHashBefore !== lastHash) {
        issues.push(
          `Content hash mismatch at entry ${entry.id}`
        );
      }
      if (entry.contentHashAfter) {
        lastHash = entry.contentHashAfter;
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate a unique ID for audit entries.
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Create a system actor for automated actions.
 */
export function createSystemActor(name: string = 'system'): AuditActor {
  return {
    id: 'system',
    type: 'system',
    name,
  };
}

/**
 * Create an agent actor.
 */
export function createAgentActor(agentId: string, name?: string): AuditActor {
  return {
    id: agentId,
    type: 'agent',
    name,
  };
}

/**
 * Create a human actor.
 */
export function createHumanActor(userId: string, name?: string): AuditActor {
  return {
    id: userId,
    type: 'human',
    name,
  };
}
