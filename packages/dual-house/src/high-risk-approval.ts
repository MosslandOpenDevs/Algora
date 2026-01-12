// ===========================================
// High-Risk Approval System
// ===========================================

import {
  HouseType,
  HighRiskApproval,
  DualHouseVoting,
} from './types.js';
import { DualHouseVotingManager } from './voting.js';

// ============================================
// Storage Interface
// ============================================

/**
 * Storage interface for high-risk approval data.
 */
export interface HighRiskApprovalStorage {
  getApproval(approvalId: string): Promise<HighRiskApproval | null>;
  getApprovalByProposal(proposalId: string): Promise<HighRiskApproval | null>;
  getApprovalByVoting(votingId: string): Promise<HighRiskApproval | null>;
  saveApproval(approval: HighRiskApproval): Promise<void>;
  listApprovals(options?: ListApprovalsOptions): Promise<HighRiskApproval[]>;
  countApprovals(options?: ListApprovalsOptions): Promise<number>;
}

/**
 * Options for listing high-risk approvals.
 */
export interface ListApprovalsOptions {
  lockStatus?: 'LOCKED' | 'UNLOCKED';
  actionType?: string;
  createdAfter?: Date;
  executedBefore?: Date;
  hasAllApprovals?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================
// In-Memory Storage Implementation
// ============================================

/**
 * In-memory storage for development/testing.
 */
export class InMemoryHighRiskApprovalStorage implements HighRiskApprovalStorage {
  private approvals: Map<string, HighRiskApproval> = new Map();

  async getApproval(approvalId: string): Promise<HighRiskApproval | null> {
    return this.approvals.get(approvalId) || null;
  }

  async getApprovalByProposal(proposalId: string): Promise<HighRiskApproval | null> {
    for (const approval of this.approvals.values()) {
      if (approval.proposalId === proposalId) {
        return approval;
      }
    }
    return null;
  }

  async getApprovalByVoting(votingId: string): Promise<HighRiskApproval | null> {
    for (const approval of this.approvals.values()) {
      if (approval.votingId === votingId) {
        return approval;
      }
    }
    return null;
  }

  async saveApproval(approval: HighRiskApproval): Promise<void> {
    this.approvals.set(approval.id, approval);
  }

  async listApprovals(options?: ListApprovalsOptions): Promise<HighRiskApproval[]> {
    let approvals = Array.from(this.approvals.values());

    if (options?.lockStatus) {
      approvals = approvals.filter(a => a.lockStatus === options.lockStatus);
    }
    if (options?.actionType) {
      approvals = approvals.filter(a => a.actionType === options.actionType);
    }
    if (options?.createdAfter) {
      approvals = approvals.filter(a => a.createdAt > options.createdAfter!);
    }
    if (options?.executedBefore) {
      approvals = approvals.filter(a => a.executedAt && a.executedAt < options.executedBefore!);
    }
    if (options?.hasAllApprovals !== undefined) {
      approvals = approvals.filter(a => {
        const hasAll = a.approvals.mossCoinHouse &&
                       a.approvals.openSourceHouse &&
                       a.approvals.director3;
        return hasAll === options.hasAllApprovals;
      });
    }

    // Sort by creation date descending
    approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.offset !== undefined) {
      approvals = approvals.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      approvals = approvals.slice(0, options.limit);
    }

    return approvals;
  }

  async countApprovals(options?: ListApprovalsOptions): Promise<number> {
    const approvals = await this.listApprovals({ ...options, limit: undefined, offset: undefined });
    return approvals.length;
  }

  // Clear all data (for testing)
  clear(): void {
    this.approvals.clear();
  }
}

// ============================================
// High-Risk Approval Manager
// ============================================

/**
 * Events emitted by HighRiskApprovalManager.
 */
export interface HighRiskApprovalManagerEvents {
  'highrisk:created': { approval: HighRiskApproval };
  'highrisk:house_approved': { approvalId: string; house: HouseType };
  'highrisk:director3_approved': { approvalId: string; director3Id: string };
  'highrisk:unlocked': { approvalId: string };
  'highrisk:executed': { approvalId: string; result: unknown };
  'highrisk:rejected': { approvalId: string; reason: string };
}

/**
 * Event handler type.
 */
type HighRiskEventHandler<K extends keyof HighRiskApprovalManagerEvents> = (
  data: HighRiskApprovalManagerEvents[K]
) => void;

/**
 * Configuration for HighRiskApprovalManager.
 */
export interface HighRiskApprovalManagerConfig {
  requireDirector3: boolean;
  director3Ids?: string[];
  allowedActionTypes?: string[];
}

/**
 * Execution handler function type.
 */
export type ExecutionHandler = (
  payload: Record<string, unknown>
) => Promise<unknown>;

/**
 * Manages high-risk action approvals.
 */
export class HighRiskApprovalManager {
  private storage: HighRiskApprovalStorage;
  private votingManager: DualHouseVotingManager;
  private config: Required<HighRiskApprovalManagerConfig>;
  private eventHandlers: Map<keyof HighRiskApprovalManagerEvents, Set<HighRiskEventHandler<keyof HighRiskApprovalManagerEvents>>> = new Map();
  private executionHandlers: Map<string, ExecutionHandler> = new Map();

  constructor(
    storage: HighRiskApprovalStorage,
    votingManager: DualHouseVotingManager,
    config?: HighRiskApprovalManagerConfig
  ) {
    this.storage = storage;
    this.votingManager = votingManager;
    this.config = {
      requireDirector3: config?.requireDirector3 ?? true,
      director3Ids: config?.director3Ids || [],
      allowedActionTypes: config?.allowedActionTypes || [
        'fund_transfer',
        'contract_deploy',
        'partnership_agreement',
        'treasury_allocation',
        'token_mint',
        'token_burn',
        'protocol_upgrade',
        'emergency_action',
      ],
    };
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof HighRiskApprovalManagerEvents>(
    event: K,
    handler: HighRiskEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as HighRiskEventHandler<keyof HighRiskApprovalManagerEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof HighRiskApprovalManagerEvents>(
    event: K,
    handler: HighRiskEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as HighRiskEventHandler<keyof HighRiskApprovalManagerEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof HighRiskApprovalManagerEvents>(
    event: K,
    data: HighRiskApprovalManagerEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Execution Handler Registration
  // ==========================================

  /**
   * Register an execution handler for an action type.
   */
  registerExecutionHandler(actionType: string, handler: ExecutionHandler): void {
    this.executionHandlers.set(actionType, handler);
  }

  /**
   * Unregister an execution handler.
   */
  unregisterExecutionHandler(actionType: string): void {
    this.executionHandlers.delete(actionType);
  }

  // ==========================================
  // Approval Creation
  // ==========================================

  /**
   * Create a high-risk approval request.
   */
  async createApproval(params: {
    proposalId: string;
    votingId: string;
    actionDescription: string;
    actionType: string;
    executionPayload?: Record<string, unknown>;
  }): Promise<HighRiskApproval> {
    // Validate action type
    if (!this.config.allowedActionTypes.includes(params.actionType)) {
      throw new Error(`Action type '${params.actionType}' is not allowed`);
    }

    // Check if approval already exists
    const existingApproval = await this.storage.getApprovalByProposal(params.proposalId);
    if (existingApproval) {
      throw new Error('High-risk approval already exists for this proposal');
    }

    // Get voting session to verify it's HIGH risk
    const voting = await this.votingManager.getVoting(params.votingId);
    if (!voting) {
      throw new Error(`Voting session ${params.votingId} not found`);
    }
    if (voting.riskLevel !== 'HIGH') {
      throw new Error('High-risk approval can only be created for HIGH risk proposals');
    }

    const now = new Date();

    const approval: HighRiskApproval = {
      id: `hr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: params.proposalId,
      votingId: params.votingId,
      riskLevel: 'HIGH',
      actionDescription: params.actionDescription,
      actionType: params.actionType,
      approvals: {
        mossCoinHouse: false,
        openSourceHouse: false,
        director3: false,
      },
      lockStatus: 'LOCKED',
      executionPayload: params.executionPayload,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.saveApproval(approval);
    this.emit('highrisk:created', { approval });

    return approval;
  }

  /**
   * Create approval from voting session if needed.
   */
  async createApprovalFromVoting(voting: DualHouseVoting): Promise<HighRiskApproval | null> {
    // Only create for HIGH risk voting sessions
    if (voting.riskLevel !== 'HIGH') {
      return null;
    }

    // Check if both houses passed
    if (!voting.mossCoinHouse.passed || !voting.openSourceHouse.passed) {
      return null;
    }

    // Check if approval already exists
    const existingApproval = await this.storage.getApprovalByVoting(voting.id);
    if (existingApproval) {
      return existingApproval;
    }

    // Infer action type from category
    const actionType = this.inferActionType(voting.category);

    const approval = await this.createApproval({
      proposalId: voting.proposalId,
      votingId: voting.id,
      actionDescription: `Execute HIGH-risk action: ${voting.title}`,
      actionType,
      executionPayload: voting.metadata as Record<string, unknown>,
    });

    // Auto-approve houses since they already passed
    await this.recordHouseApproval(approval.id, 'mosscoin');
    await this.recordHouseApproval(approval.id, 'opensource');

    return approval;
  }

  /**
   * Infer action type from category.
   */
  private inferActionType(category: string): string {
    const categoryToActionType: Record<string, string> = {
      treasury: 'treasury_allocation',
      tokenomics: 'token_mint',
      partnership: 'partnership_agreement',
      security: 'emergency_action',
      governance: 'protocol_upgrade',
      token_burn: 'token_burn',
      token_mint: 'token_mint',
      treasury_allocation: 'treasury_allocation',
    };

    return categoryToActionType[category.toLowerCase()] || 'fund_transfer';
  }

  // ==========================================
  // Approval Recording
  // ==========================================

  /**
   * Record house approval.
   */
  async recordHouseApproval(approvalId: string, house: HouseType): Promise<HighRiskApproval> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`High-risk approval ${approvalId} not found`);
    }

    if (approval.lockStatus === 'UNLOCKED') {
      throw new Error('Approval already unlocked');
    }

    if (house === 'mosscoin') {
      approval.approvals.mossCoinHouse = true;
    } else {
      approval.approvals.openSourceHouse = true;
    }

    approval.updatedAt = new Date();
    await this.storage.saveApproval(approval);

    this.emit('highrisk:house_approved', { approvalId, house });

    // Check if ready to unlock
    await this.checkAndUnlock(approvalId);

    return approval;
  }

  /**
   * Record Director 3 approval.
   */
  async recordDirector3Approval(
    approvalId: string,
    director3Id: string
  ): Promise<HighRiskApproval> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`High-risk approval ${approvalId} not found`);
    }

    if (approval.lockStatus === 'UNLOCKED') {
      throw new Error('Approval already unlocked');
    }

    // Validate Director 3
    if (this.config.director3Ids.length > 0 && !this.config.director3Ids.includes(director3Id)) {
      throw new Error(`${director3Id} is not authorized as Director 3`);
    }

    approval.approvals.director3 = true;
    approval.updatedAt = new Date();
    await this.storage.saveApproval(approval);

    this.emit('highrisk:director3_approved', { approvalId, director3Id });

    // Check if ready to unlock
    await this.checkAndUnlock(approvalId);

    return approval;
  }

  /**
   * Check if all approvals are received and unlock.
   */
  private async checkAndUnlock(approvalId: string): Promise<void> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval || approval.lockStatus === 'UNLOCKED') return;

    if (this.canUnlock(approval)) {
      await this.unlock(approvalId);
    }
  }

  /**
   * Check if approval can be unlocked.
   */
  canUnlock(approval: HighRiskApproval): boolean {
    const { mossCoinHouse, openSourceHouse, director3 } = approval.approvals;

    // Both houses must approve
    if (!mossCoinHouse || !openSourceHouse) {
      return false;
    }

    // Director 3 must approve if required
    if (this.config.requireDirector3 && !director3) {
      return false;
    }

    return true;
  }

  /**
   * Get missing approvals.
   */
  getMissingApprovals(approval: HighRiskApproval): string[] {
    const missing: string[] = [];

    if (!approval.approvals.mossCoinHouse) {
      missing.push('MossCoin House');
    }
    if (!approval.approvals.openSourceHouse) {
      missing.push('OpenSource House');
    }
    if (this.config.requireDirector3 && !approval.approvals.director3) {
      missing.push('Director 3');
    }

    return missing;
  }

  // ==========================================
  // Unlock and Execution
  // ==========================================

  /**
   * Unlock a high-risk approval.
   */
  async unlock(approvalId: string): Promise<HighRiskApproval> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`High-risk approval ${approvalId} not found`);
    }

    if (approval.lockStatus === 'UNLOCKED') {
      throw new Error('Approval already unlocked');
    }

    if (!this.canUnlock(approval)) {
      const missing = this.getMissingApprovals(approval);
      throw new Error(`Cannot unlock: missing approvals from ${missing.join(', ')}`);
    }

    approval.lockStatus = 'UNLOCKED';
    approval.unlockedAt = new Date();
    approval.updatedAt = new Date();

    await this.storage.saveApproval(approval);
    this.emit('highrisk:unlocked', { approvalId });

    return approval;
  }

  /**
   * Execute an unlocked high-risk action.
   */
  async execute(approvalId: string): Promise<unknown> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`High-risk approval ${approvalId} not found`);
    }

    if (approval.lockStatus !== 'UNLOCKED') {
      throw new Error('Cannot execute: approval is still locked');
    }

    if (approval.executedAt) {
      throw new Error('Action has already been executed');
    }

    // Get execution handler
    const handler = this.executionHandlers.get(approval.actionType);
    if (!handler) {
      throw new Error(`No execution handler registered for action type: ${approval.actionType}`);
    }

    // Execute the action
    const result = await handler(approval.executionPayload || {});

    // Update approval
    approval.executedAt = new Date();
    approval.updatedAt = new Date();
    await this.storage.saveApproval(approval);

    // Update voting status
    await this.votingManager.updateStatus(approval.votingId, 'executed');

    this.emit('highrisk:executed', { approvalId, result });

    return result;
  }

  /**
   * Reject a high-risk approval.
   */
  async reject(approvalId: string, reason: string): Promise<void> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`High-risk approval ${approvalId} not found`);
    }

    if (approval.executedAt) {
      throw new Error('Cannot reject: action has already been executed');
    }

    // Remove the approval
    await this.storage.saveApproval({
      ...approval,
      lockStatus: 'LOCKED',
      updatedAt: new Date(),
    });

    // Update voting status
    await this.votingManager.updateStatus(approval.votingId, 'rejected');

    this.emit('highrisk:rejected', { approvalId, reason });
  }

  // ==========================================
  // Query Methods
  // ==========================================

  /**
   * Get a high-risk approval.
   */
  async getApproval(approvalId: string): Promise<HighRiskApproval | null> {
    return this.storage.getApproval(approvalId);
  }

  /**
   * Get approval by proposal.
   */
  async getApprovalByProposal(proposalId: string): Promise<HighRiskApproval | null> {
    return this.storage.getApprovalByProposal(proposalId);
  }

  /**
   * Get approval by voting session.
   */
  async getApprovalByVoting(votingId: string): Promise<HighRiskApproval | null> {
    return this.storage.getApprovalByVoting(votingId);
  }

  /**
   * List high-risk approvals.
   */
  async listApprovals(options?: ListApprovalsOptions): Promise<HighRiskApproval[]> {
    return this.storage.listApprovals(options);
  }

  /**
   * Get locked approvals awaiting approval.
   */
  async getLockedApprovals(): Promise<HighRiskApproval[]> {
    return this.storage.listApprovals({ lockStatus: 'LOCKED' });
  }

  /**
   * Get unlocked approvals ready for execution.
   */
  async getUnlockedApprovals(): Promise<HighRiskApproval[]> {
    const approvals = await this.storage.listApprovals({ lockStatus: 'UNLOCKED' });
    // Filter out already executed
    return approvals.filter(a => !a.executedAt);
  }

  /**
   * Get approval status summary.
   */
  async getApprovalStatus(approvalId: string): Promise<{
    approval: HighRiskApproval;
    canUnlock: boolean;
    missingApprovals: string[];
    canExecute: boolean;
  } | null> {
    const approval = await this.storage.getApproval(approvalId);
    if (!approval) return null;

    return {
      approval,
      canUnlock: this.canUnlock(approval),
      missingApprovals: this.getMissingApprovals(approval),
      canExecute: approval.lockStatus === 'UNLOCKED' && !approval.executedAt,
    };
  }

  // ==========================================
  // Configuration
  // ==========================================

  /**
   * Add a Director 3 ID.
   */
  addDirector3(id: string): void {
    if (!this.config.director3Ids.includes(id)) {
      this.config.director3Ids.push(id);
    }
  }

  /**
   * Remove a Director 3 ID.
   */
  removeDirector3(id: string): void {
    this.config.director3Ids = this.config.director3Ids.filter(d => d !== id);
  }

  /**
   * Check if Director 3 approval is required.
   */
  isDirector3Required(): boolean {
    return this.config.requireDirector3;
  }

  /**
   * Set whether Director 3 approval is required.
   */
  setDirector3Required(required: boolean): void {
    this.config.requireDirector3 = required;
  }

  /**
   * Get allowed action types.
   */
  getAllowedActionTypes(): string[] {
    return [...this.config.allowedActionTypes];
  }

  /**
   * Add an allowed action type.
   */
  addAllowedActionType(actionType: string): void {
    if (!this.config.allowedActionTypes.includes(actionType)) {
      this.config.allowedActionTypes.push(actionType);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a HighRiskApprovalManager with in-memory storage.
 */
export function createHighRiskApprovalManager(
  votingManager: DualHouseVotingManager,
  config?: HighRiskApprovalManagerConfig
): HighRiskApprovalManager {
  const storage = new InMemoryHighRiskApprovalStorage();
  return new HighRiskApprovalManager(storage, votingManager, config);
}

/**
 * Create a HighRiskApprovalManager with custom storage.
 */
export function createHighRiskApprovalManagerWithStorage(
  storage: HighRiskApprovalStorage,
  votingManager: DualHouseVotingManager,
  config?: HighRiskApprovalManagerConfig
): HighRiskApprovalManager {
  return new HighRiskApprovalManager(storage, votingManager, config);
}
