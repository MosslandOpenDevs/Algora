// ===========================================
// Lock Manager for Algora Safe Autonomy
// ===========================================

import { randomUUID } from 'crypto';
import type {
  ActionType,
  RiskLevel,
  LockedAction,
  LockStatus,
  ApprovalRequirement,
  ApprovalRecord,
  UnlockResult,
  AuditEntry,
  SafeAutonomyConfig,
} from './types.js';
import { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';
import { riskClassifier } from './risk-classifier.js';

// ============================================
// Lock Manager Types
// ============================================

/**
 * Options for creating a locked action.
 */
export interface CreateLockOptions {
  documentId?: string;
  actionType: ActionType;
  lockReason: string;
  lockedBy: string;
  executionPayload: Record<string, unknown>;
  customRequirements?: ApprovalRequirement[];
}

/**
 * Event handler types for lock manager.
 */
export interface LockManagerEvents {
  onLock: (action: LockedAction) => void;
  onUnlock: (action: LockedAction) => void;
  onApproval: (action: LockedAction, approval: ApprovalRecord) => void;
  onReject: (action: LockedAction, reason: string) => void;
  onExecute: (action: LockedAction, result: unknown) => void;
  onAudit: (entry: AuditEntry) => void;
}

// ============================================
// Storage Interface
// ============================================

/**
 * Interface for lock storage backend.
 * Implement this to persist locks to a database.
 */
export interface LockStorage {
  save(action: LockedAction): Promise<void>;
  get(id: string): Promise<LockedAction | null>;
  getByDocumentId(documentId: string): Promise<LockedAction | null>;
  getAll(status?: LockStatus): Promise<LockedAction[]>;
  update(action: LockedAction): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory storage implementation for development/testing.
 */
export class InMemoryLockStorage implements LockStorage {
  private locks: Map<string, LockedAction> = new Map();

  async save(action: LockedAction): Promise<void> {
    this.locks.set(action.id, action);
  }

  async get(id: string): Promise<LockedAction | null> {
    return this.locks.get(id) ?? null;
  }

  async getByDocumentId(documentId: string): Promise<LockedAction | null> {
    for (const action of this.locks.values()) {
      if (action.documentId === documentId) {
        return action;
      }
    }
    return null;
  }

  async getAll(status?: LockStatus): Promise<LockedAction[]> {
    const all = Array.from(this.locks.values());
    if (status) {
      return all.filter((a) => a.status === status);
    }
    return all;
  }

  async update(action: LockedAction): Promise<void> {
    this.locks.set(action.id, action);
  }

  async delete(id: string): Promise<void> {
    this.locks.delete(id);
  }
}

// ============================================
// Lock Manager Class
// ============================================

/**
 * LockManager handles LOCK/UNLOCK logic for dangerous actions.
 * All HIGH-risk actions are automatically LOCKED until explicit approval.
 */
export class LockManager {
  private storage: LockStorage;
  private config: SafeAutonomyConfig;
  private eventHandlers: Partial<LockManagerEvents> = {};

  constructor(
    storage: LockStorage = new InMemoryLockStorage(),
    config: SafeAutonomyConfig = DEFAULT_SAFE_AUTONOMY_CONFIG
  ) {
    this.storage = storage;
    this.config = config;
  }

  /**
   * Register event handlers.
   */
  on<K extends keyof LockManagerEvents>(
    event: K,
    handler: LockManagerEvents[K]
  ): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Create a new locked action.
   */
  async lock(options: CreateLockOptions): Promise<LockedAction> {
    const classification = riskClassifier.classify(options.actionType);
    const riskLevel = classification.riskLevel;

    const requiredApprovals = options.customRequirements ??
      this.getDefaultApprovalRequirements(riskLevel);

    const timeoutHours = this.getTimeoutHours(riskLevel);
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    const lockedAction: LockedAction = {
      id: randomUUID(),
      documentId: options.documentId,
      actionType: options.actionType,
      riskLevel,
      lockReason: options.lockReason,
      lockedAt: new Date(),
      lockedBy: options.lockedBy,
      requiredApprovals,
      receivedApprovals: [],
      executionPayload: options.executionPayload,
      status: 'LOCKED',
      timeoutAt,
      remindersSent: 0,
    };

    await this.storage.save(lockedAction);
    await this.audit('LOCKED', lockedAction);
    this.eventHandlers.onLock?.(lockedAction);

    return lockedAction;
  }

  /**
   * Add an approval to a locked action.
   */
  async addApproval(
    lockedActionId: string,
    approval: Omit<ApprovalRecord, 'id' | 'lockedActionId'>
  ): Promise<UnlockResult> {
    const action = await this.storage.get(lockedActionId);
    if (!action) {
      throw new Error(`Locked action not found: ${lockedActionId}`);
    }

    if (action.status !== 'LOCKED' && action.status !== 'PENDING_APPROVAL') {
      throw new Error(`Action is not in lockable state: ${action.status}`);
    }

    const approvalRecord: ApprovalRecord = {
      id: randomUUID(),
      lockedActionId,
      ...approval,
    };

    action.receivedApprovals.push(approvalRecord);
    action.status = 'PENDING_APPROVAL';

    await this.storage.update(action);
    await this.audit('APPROVED', action, { approval: approvalRecord });
    this.eventHandlers.onApproval?.(action, approvalRecord);

    // Check if all required approvals are met
    return this.checkUnlockStatus(action);
  }

  /**
   * Reject a locked action.
   */
  async reject(
    lockedActionId: string,
    rejectedBy: string,
    reason: string
  ): Promise<LockedAction> {
    const action = await this.storage.get(lockedActionId);
    if (!action) {
      throw new Error(`Locked action not found: ${lockedActionId}`);
    }

    action.status = 'REJECTED';
    await this.storage.update(action);
    await this.audit('REJECTED', action, { rejectedBy, reason });
    this.eventHandlers.onReject?.(action, reason);

    return action;
  }

  /**
   * Attempt to unlock an action (check if requirements are met).
   */
  async checkUnlockStatus(action: LockedAction): Promise<UnlockResult> {
    const missingApprovals = this.getMissingApprovals(action);
    const canExecute = missingApprovals.length === 0;

    if (canExecute) {
      action.status = 'APPROVED';
      action.unlockedAt = new Date();
      await this.storage.update(action);
      await this.audit('UNLOCKED', action);
      this.eventHandlers.onUnlock?.(action);
    }

    return {
      success: canExecute,
      lockedAction: action,
      canExecute,
      missingApprovals,
      reason: canExecute ? undefined : 'Missing required approvals',
    };
  }

  /**
   * Execute a locked action after it has been approved.
   */
  async execute<T>(
    lockedActionId: string,
    executor: (payload: Record<string, unknown>) => Promise<T>
  ): Promise<T> {
    const action = await this.storage.get(lockedActionId);
    if (!action) {
      throw new Error(`Locked action not found: ${lockedActionId}`);
    }

    if (action.status !== 'APPROVED') {
      throw new Error(`Action is not approved: ${action.status}`);
    }

    // Verify HIGH-risk actions have required approvals
    if (action.riskLevel === 'HIGH') {
      const unlockResult = await this.checkUnlockStatus(action);
      if (!unlockResult.canExecute) {
        throw new Error(
          `HIGH-risk action cannot execute without approvals: ${unlockResult.missingApprovals.map((a) => a.approverType).join(', ')}`
        );
      }
    }

    try {
      const result = await executor(action.executionPayload);
      action.status = 'EXECUTED';
      action.executedAt = new Date();
      await this.storage.update(action);
      await this.audit('EXECUTED', action, { result });
      this.eventHandlers.onExecute?.(action, result);
      return result;
    } catch (error) {
      await this.audit('STATE_CHANGED', action, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if an action can be executed (has all required approvals).
   */
  canExecute(action: LockedAction): boolean {
    if (action.riskLevel !== 'HIGH') {
      return action.status === 'APPROVED';
    }

    // For HIGH-risk, must have required human approval
    return action.receivedApprovals.some(
      (a) =>
        a.reviewerType === 'human' &&
        a.action === 'approve' &&
        (a.reviewerRole === 'director_3' ||
          a.reviewerId === this.config.director3.userId)
    );
  }

  /**
   * Get locked actions by status.
   */
  async getByStatus(status: LockStatus): Promise<LockedAction[]> {
    return this.storage.getAll(status);
  }

  /**
   * Get a locked action by ID.
   */
  async get(id: string): Promise<LockedAction | null> {
    return this.storage.get(id);
  }

  /**
   * Get a locked action by document ID.
   */
  async getByDocumentId(documentId: string): Promise<LockedAction | null> {
    return this.storage.getByDocumentId(documentId);
  }

  /**
   * Get all pending locked actions (for reminder processing).
   */
  async getPendingActions(): Promise<LockedAction[]> {
    const locked = await this.storage.getAll('LOCKED');
    const pending = await this.storage.getAll('PENDING_APPROVAL');
    return [...locked, ...pending];
  }

  /**
   * Process expired locks based on timeout action.
   */
  async processExpiredLocks(): Promise<void> {
    const pending = await this.getPendingActions();
    const now = new Date();

    for (const action of pending) {
      if (action.timeoutAt <= now) {
        const policy = this.config.routingPolicies.find(
          (p) => p.riskLevel === action.riskLevel
        );

        if (policy) {
          switch (policy.timeoutAction) {
            case 'auto_approve':
              await this.autoApprove(action);
              break;
            case 'escalate':
              await this.escalate(action);
              break;
            case 'reject':
              await this.reject(action.id, 'system', 'Timeout expired');
              break;
          }
        }
      }
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private getDefaultApprovalRequirements(
    riskLevel: RiskLevel
  ): ApprovalRequirement[] {
    switch (riskLevel) {
      case 'HIGH':
        return [
          { approverType: 'director_3', required: true },
          { approverType: 'moc_house', required: true },
          { approverType: 'oss_house', required: true },
        ];
      case 'MID':
        return [{ approverType: 'any_reviewer', required: false }];
      case 'LOW':
        return [];
    }
  }

  private getTimeoutHours(riskLevel: RiskLevel): number {
    const policy = this.config.routingPolicies.find(
      (p) => p.riskLevel === riskLevel
    );
    return policy?.timeoutHours ?? 72;
  }

  private getMissingApprovals(action: LockedAction): ApprovalRequirement[] {
    const missing: ApprovalRequirement[] = [];

    for (const req of action.requiredApprovals) {
      if (!req.required) continue;

      const hasApproval = action.receivedApprovals.some((a) => {
        if (a.action !== 'approve') return false;
        if (req.approverType === 'director_3') {
          return (
            a.reviewerRole === 'director_3' ||
            a.reviewerId === this.config.director3.userId
          );
        }
        if (req.approverType === 'moc_house') {
          return a.reviewerRole === 'moc_house';
        }
        if (req.approverType === 'oss_house') {
          return a.reviewerRole === 'oss_house';
        }
        return a.reviewerType === 'human';
      });

      if (!hasApproval) {
        missing.push(req);
      }
    }

    return missing;
  }

  private async autoApprove(action: LockedAction): Promise<void> {
    // Only auto-approve if not HIGH-risk
    if (action.riskLevel === 'HIGH') {
      await this.escalate(action);
      return;
    }

    action.status = 'APPROVED';
    action.unlockedAt = new Date();
    action.receivedApprovals.push({
      id: randomUUID(),
      lockedActionId: action.id,
      reviewerId: 'system',
      reviewerType: 'agent',
      action: 'approve',
      timestamp: new Date(),
      comments: 'Auto-approved after timeout (Passive Consensus)',
    });

    await this.storage.update(action);
    await this.audit('UNLOCKED', action, { reason: 'auto_approve_timeout' });
    this.eventHandlers.onUnlock?.(action);
  }

  private async escalate(action: LockedAction): Promise<void> {
    await this.audit('ESCALATED', action, {
      escalatedTo: this.config.director3.userId,
      reason: 'timeout_escalation',
    });
  }

  private async audit(
    auditAction: AuditEntry['action'],
    action: LockedAction,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const entry: AuditEntry = {
      id: randomUUID(),
      lockedActionId: action.id,
      documentId: action.documentId,
      action: auditAction,
      actor: {
        id: 'system',
        type: 'system',
      },
      timestamp: new Date(),
      previousState: undefined,
      newState: action.status,
      metadata: {
        ...metadata,
        actionType: action.actionType,
        riskLevel: action.riskLevel,
      },
    };

    this.eventHandlers.onAudit?.(entry);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new LockManager instance.
 */
export function createLockManager(
  storage?: LockStorage,
  config?: SafeAutonomyConfig
): LockManager {
  return new LockManager(storage, config);
}
