// ===========================================
// Passive Consensus for Algora Safe Autonomy
// ===========================================

import { randomUUID } from 'crypto';
import type {
  RiskLevel,
  PassiveConsensusItem,
  PassiveConsensusStatus,
  VetoRecord,
  EscalationRecord,
  SafeAutonomyConfig,
} from './types.js';
import { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';

// ============================================
// Passive Consensus Types
// ============================================

/**
 * Options for creating a passive consensus item.
 */
export interface CreateConsensusOptions {
  documentId: string;
  documentType: string;
  riskLevel: RiskLevel;
  customReviewPeriodHours?: number;
}

/**
 * Result of checking passive consensus status.
 */
export interface ConsensusCheckResult {
  item: PassiveConsensusItem;
  isApproved: boolean;
  isVetoed: boolean;
  isEscalated: boolean;
  isPending: boolean;
  timeRemaining: number; // milliseconds
  unreviewedByHuman: boolean;
}

/**
 * Event handlers for passive consensus.
 */
export interface PassiveConsensusEvents {
  onCreate: (item: PassiveConsensusItem) => void;
  onApprove: (item: PassiveConsensusItem) => void;
  onVeto: (item: PassiveConsensusItem, veto: VetoRecord) => void;
  onEscalate: (item: PassiveConsensusItem, escalation: EscalationRecord) => void;
  onExpire: (item: PassiveConsensusItem) => void;
}

// ============================================
// Storage Interface
// ============================================

/**
 * Interface for passive consensus storage.
 */
export interface ConsensusStorage {
  save(item: PassiveConsensusItem): Promise<void>;
  get(id: string): Promise<PassiveConsensusItem | null>;
  getByDocumentId(documentId: string): Promise<PassiveConsensusItem | null>;
  getAll(status?: PassiveConsensusStatus): Promise<PassiveConsensusItem[]>;
  getPending(): Promise<PassiveConsensusItem[]>;
  update(item: PassiveConsensusItem): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory storage for development/testing.
 */
export class InMemoryConsensusStorage implements ConsensusStorage {
  private items: Map<string, PassiveConsensusItem> = new Map();

  async save(item: PassiveConsensusItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async get(id: string): Promise<PassiveConsensusItem | null> {
    return this.items.get(id) ?? null;
  }

  async getByDocumentId(
    documentId: string
  ): Promise<PassiveConsensusItem | null> {
    for (const item of this.items.values()) {
      if (item.documentId === documentId) {
        return item;
      }
    }
    return null;
  }

  async getAll(
    status?: PassiveConsensusStatus
  ): Promise<PassiveConsensusItem[]> {
    const all = Array.from(this.items.values());
    if (status) {
      return all.filter((i) => i.status === status);
    }
    return all;
  }

  async getPending(): Promise<PassiveConsensusItem[]> {
    return Array.from(this.items.values()).filter(
      (i) => i.status === 'PENDING'
    );
  }

  async update(item: PassiveConsensusItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

// ============================================
// Passive Consensus Manager Class
// ============================================

/**
 * PassiveConsensusManager implements the opt-out approval model.
 * Documents are auto-approved after a review period unless vetoed.
 */
export class PassiveConsensusManager {
  private storage: ConsensusStorage;
  private config: SafeAutonomyConfig;
  private eventHandlers: Partial<PassiveConsensusEvents> = {};

  constructor(
    storage: ConsensusStorage = new InMemoryConsensusStorage(),
    config: SafeAutonomyConfig = DEFAULT_SAFE_AUTONOMY_CONFIG
  ) {
    this.storage = storage;
    this.config = config;
  }

  /**
   * Register event handlers.
   */
  on<K extends keyof PassiveConsensusEvents>(
    event: K,
    handler: PassiveConsensusEvents[K]
  ): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Create a new passive consensus item for a document.
   */
  async create(options: CreateConsensusOptions): Promise<PassiveConsensusItem> {
    const reviewPeriodHours =
      options.customReviewPeriodHours ??
      this.config.passiveConsensus.defaultReviewPeriodHours[options.riskLevel];

    const reviewPeriodEndsAt = new Date(
      Date.now() + reviewPeriodHours * 60 * 60 * 1000
    );

    const item: PassiveConsensusItem = {
      id: randomUUID(),
      documentId: options.documentId,
      documentType: options.documentType,
      riskLevel: options.riskLevel,
      status: 'PENDING',
      createdAt: new Date(),
      reviewPeriodEndsAt,
      unreviewedByHuman: true,
      vetoes: [],
      escalations: [],
    };

    await this.storage.save(item);
    this.eventHandlers.onCreate?.(item);

    return item;
  }

  /**
   * Record a veto against a document.
   */
  async veto(
    documentId: string,
    vetoerId: string,
    vetoerType: 'human' | 'agent',
    reason: string
  ): Promise<PassiveConsensusItem> {
    const item = await this.storage.getByDocumentId(documentId);
    if (!item) {
      throw new Error(`No consensus item for document: ${documentId}`);
    }

    if (item.status !== 'PENDING') {
      throw new Error(`Cannot veto item with status: ${item.status}`);
    }

    const veto: VetoRecord = {
      id: randomUUID(),
      vetoerId,
      vetoerType,
      reason,
      timestamp: new Date(),
    };

    item.vetoes.push(veto);
    item.status = 'VETOED';

    if (vetoerType === 'human') {
      item.unreviewedByHuman = false;
    }

    await this.storage.update(item);
    this.eventHandlers.onVeto?.(item, veto);

    return item;
  }

  /**
   * Escalate a document to Director 3.
   */
  async escalate(
    documentId: string,
    escalatorId: string,
    escalatorType: 'human' | 'agent',
    reason: string
  ): Promise<PassiveConsensusItem> {
    const item = await this.storage.getByDocumentId(documentId);
    if (!item) {
      throw new Error(`No consensus item for document: ${documentId}`);
    }

    if (item.status !== 'PENDING') {
      throw new Error(`Cannot escalate item with status: ${item.status}`);
    }

    const escalation: EscalationRecord = {
      id: randomUUID(),
      escalatorId,
      escalatorType,
      reason,
      escalatedTo: this.config.director3.userId,
      timestamp: new Date(),
    };

    item.escalations.push(escalation);
    item.status = 'ESCALATED';

    await this.storage.update(item);
    this.eventHandlers.onEscalate?.(item, escalation);

    return item;
  }

  /**
   * Explicitly approve a document (removes "Unreviewed" label).
   */
  async approve(
    documentId: string,
    _approverId: string,
    approverType: 'human' | 'agent'
  ): Promise<PassiveConsensusItem> {
    const item = await this.storage.getByDocumentId(documentId);
    if (!item) {
      throw new Error(`No consensus item for document: ${documentId}`);
    }

    if (item.status !== 'PENDING') {
      throw new Error(`Cannot approve item with status: ${item.status}`);
    }

    item.status = 'EXPLICITLY_APPROVED';
    item.autoApprovedAt = new Date();

    if (approverType === 'human') {
      item.unreviewedByHuman = false;
    }

    await this.storage.update(item);
    this.eventHandlers.onApprove?.(item);

    return item;
  }

  /**
   * Check the current consensus status for a document.
   */
  async checkStatus(documentId: string): Promise<ConsensusCheckResult> {
    const item = await this.storage.getByDocumentId(documentId);
    if (!item) {
      throw new Error(`No consensus item for document: ${documentId}`);
    }

    const now = Date.now();
    const timeRemaining = Math.max(
      0,
      item.reviewPeriodEndsAt.getTime() - now
    );

    return {
      item,
      isApproved:
        item.status === 'APPROVED_BY_TIMEOUT' ||
        item.status === 'EXPLICITLY_APPROVED',
      isVetoed: item.status === 'VETOED',
      isEscalated: item.status === 'ESCALATED',
      isPending: item.status === 'PENDING',
      timeRemaining,
      unreviewedByHuman: item.unreviewedByHuman,
    };
  }

  /**
   * Process pending items and auto-approve those past their review period.
   * This should be called periodically (e.g., every minute).
   */
  async processExpiredItems(): Promise<PassiveConsensusItem[]> {
    const pending = await this.storage.getPending();
    const now = Date.now();
    const approved: PassiveConsensusItem[] = [];

    for (const item of pending) {
      if (item.reviewPeriodEndsAt.getTime() <= now) {
        // HIGH-risk items should never auto-approve
        if (item.riskLevel === 'HIGH') {
          await this.escalate(
            item.documentId,
            'system',
            'agent',
            'Review period expired for HIGH-risk item'
          );
          continue;
        }

        item.status = 'APPROVED_BY_TIMEOUT';
        item.autoApprovedAt = new Date();

        await this.storage.update(item);
        this.eventHandlers.onExpire?.(item);
        approved.push(item);
      }
    }

    return approved;
  }

  /**
   * Get all pending consensus items.
   */
  async getPending(): Promise<PassiveConsensusItem[]> {
    return this.storage.getPending();
  }

  /**
   * Get a consensus item by ID.
   */
  async get(id: string): Promise<PassiveConsensusItem | null> {
    return this.storage.get(id);
  }

  /**
   * Get a consensus item by document ID.
   */
  async getByDocumentId(
    documentId: string
  ): Promise<PassiveConsensusItem | null> {
    return this.storage.getByDocumentId(documentId);
  }

  /**
   * Generate the "Unreviewed by Human" label for a document.
   */
  generateUnreviewedLabel(item: PassiveConsensusItem): string {
    if (!item.unreviewedByHuman) {
      return '';
    }

    return `[UNREVIEWED BY HUMAN] This document was auto-approved via Passive Consensus.
Review history: ${item.vetoes.length === 0 && item.escalations.length === 0 ? 'None' : `${item.vetoes.length} vetoes, ${item.escalations.length} escalations`}`;
  }

  /**
   * Check if passive consensus is enabled.
   */
  isEnabled(): boolean {
    return this.config.passiveConsensus.enabled;
  }

  /**
   * Get the review period for a risk level.
   */
  getReviewPeriodHours(riskLevel: RiskLevel): number {
    return this.config.passiveConsensus.defaultReviewPeriodHours[riskLevel];
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new PassiveConsensusManager instance.
 */
export function createPassiveConsensusManager(
  storage?: ConsensusStorage,
  config?: SafeAutonomyConfig
): PassiveConsensusManager {
  return new PassiveConsensusManager(storage, config);
}

/**
 * Check if a document can auto-approve based on its risk level.
 */
export function canAutoApprove(riskLevel: RiskLevel): boolean {
  // HIGH-risk items can never auto-approve
  return riskLevel !== 'HIGH';
}
