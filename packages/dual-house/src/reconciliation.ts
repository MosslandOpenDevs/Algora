// ===========================================
// Reconciliation Process for Dual-House Conflicts
// ===========================================

import {
  DualHouseVoting,
  ReconciliationMemo,
  ReconciliationRecommendation,
  ConflictSummary,
  OrchestratorAnalysis,
  Director3Decision,
  Director3DecisionType,
} from './types.js';
import { DualHouseVotingManager } from './voting.js';

// ============================================
// Storage Interface
// ============================================

/**
 * Storage interface for reconciliation data.
 */
export interface ReconciliationStorage {
  getMemo(memoId: string): Promise<ReconciliationMemo | null>;
  getMemoByVoting(votingId: string): Promise<ReconciliationMemo | null>;
  saveMemo(memo: ReconciliationMemo): Promise<void>;
  listMemos(options?: ListMemosOptions): Promise<ReconciliationMemo[]>;
  countMemos(options?: ListMemosOptions): Promise<number>;
}

/**
 * Options for listing reconciliation memos.
 */
export interface ListMemosOptions {
  status?: ReconciliationMemo['status'] | ReconciliationMemo['status'][];
  proposalId?: string;
  expiredBefore?: Date;
  createdAfter?: Date;
  limit?: number;
  offset?: number;
}

// ============================================
// In-Memory Storage Implementation
// ============================================

/**
 * In-memory storage for development/testing.
 */
export class InMemoryReconciliationStorage implements ReconciliationStorage {
  private memos: Map<string, ReconciliationMemo> = new Map();

  async getMemo(memoId: string): Promise<ReconciliationMemo | null> {
    return this.memos.get(memoId) || null;
  }

  async getMemoByVoting(votingId: string): Promise<ReconciliationMemo | null> {
    for (const memo of this.memos.values()) {
      if (memo.votingId === votingId) {
        return memo;
      }
    }
    return null;
  }

  async saveMemo(memo: ReconciliationMemo): Promise<void> {
    this.memos.set(memo.id, memo);
  }

  async listMemos(options?: ListMemosOptions): Promise<ReconciliationMemo[]> {
    let memos = Array.from(this.memos.values());

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      memos = memos.filter(m => statuses.includes(m.status));
    }
    if (options?.proposalId) {
      memos = memos.filter(m => m.proposalId === options.proposalId);
    }
    if (options?.expiredBefore) {
      memos = memos.filter(m => m.expiresAt < options.expiredBefore!);
    }
    if (options?.createdAfter) {
      memos = memos.filter(m => m.createdAt > options.createdAfter!);
    }

    // Sort by creation date descending
    memos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.offset !== undefined) {
      memos = memos.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      memos = memos.slice(0, options.limit);
    }

    return memos;
  }

  async countMemos(options?: ListMemosOptions): Promise<number> {
    const memos = await this.listMemos({ ...options, limit: undefined, offset: undefined });
    return memos.length;
  }

  // Clear all data (for testing)
  clear(): void {
    this.memos.clear();
  }
}

// ============================================
// Reconciliation Manager
// ============================================

/**
 * Events emitted by ReconciliationManager.
 */
export interface ReconciliationManagerEvents {
  'reconciliation:triggered': { votingId: string; memo: ReconciliationMemo };
  'reconciliation:analysis_complete': { memoId: string; analysis: OrchestratorAnalysis };
  'reconciliation:director3_required': { memoId: string };
  'reconciliation:director3_decided': { memoId: string; decision: Director3Decision };
  'reconciliation:resolved': { memoId: string; outcome: string };
  'reconciliation:expired': { memoId: string };
}

/**
 * Event handler type.
 */
type ReconciliationEventHandler<K extends keyof ReconciliationManagerEvents> = (
  data: ReconciliationManagerEvents[K]
) => void;

/**
 * Configuration for ReconciliationManager.
 */
export interface ReconciliationManagerConfig {
  timeoutHours?: number;
  director3Ids?: string[];
  autoEscalateToDirector3?: boolean;
}

/**
 * Manages the reconciliation process for dual-house conflicts.
 */
export class ReconciliationManager {
  private storage: ReconciliationStorage;
  private votingManager: DualHouseVotingManager;
  private config: Required<ReconciliationManagerConfig>;
  private eventHandlers: Map<keyof ReconciliationManagerEvents, Set<ReconciliationEventHandler<keyof ReconciliationManagerEvents>>> = new Map();
  private memoCounter = 0;

  constructor(
    storage: ReconciliationStorage,
    votingManager: DualHouseVotingManager,
    config?: ReconciliationManagerConfig
  ) {
    this.storage = storage;
    this.votingManager = votingManager;
    this.config = {
      timeoutHours: config?.timeoutHours || 72,
      director3Ids: config?.director3Ids || [],
      autoEscalateToDirector3: config?.autoEscalateToDirector3 ?? true,
    };
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof ReconciliationManagerEvents>(
    event: K,
    handler: ReconciliationEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as ReconciliationEventHandler<keyof ReconciliationManagerEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof ReconciliationManagerEvents>(
    event: K,
    handler: ReconciliationEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as ReconciliationEventHandler<keyof ReconciliationManagerEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof ReconciliationManagerEvents>(
    event: K,
    data: ReconciliationManagerEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Reconciliation Trigger
  // ==========================================

  /**
   * Trigger reconciliation for a voting session with conflicting results.
   */
  async triggerReconciliation(
    votingId: string,
    conflictSummary: ConflictSummary
  ): Promise<ReconciliationMemo> {
    // Get voting session
    const voting = await this.votingManager.getVoting(votingId);
    if (!voting) {
      throw new Error(`Voting session ${votingId} not found`);
    }

    // Validate that reconciliation is needed
    if (!voting.requiresReconciliation) {
      throw new Error('Voting session does not require reconciliation');
    }

    // Check if reconciliation already exists
    const existingMemo = await this.storage.getMemoByVoting(votingId);
    if (existingMemo) {
      throw new Error('Reconciliation memo already exists for this voting session');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.timeoutHours * 60 * 60 * 1000);

    // Generate document ID
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    this.memoCounter++;
    const documentId = `RC-${dateStr}-${String(this.memoCounter).padStart(3, '0')}`;

    const memo: ReconciliationMemo = {
      id: `rc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      documentId,
      proposalId: voting.proposalId,
      votingId,
      conflictSummary,
      orchestratorAnalysis: {
        underlyingConcerns: [],
        possibleCompromises: [],
        recommendation: 'compromise',
        reasoning: '',
        confidence: 0,
      },
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    await this.storage.saveMemo(memo);

    // Update voting status
    await this.votingManager.setReconciliationMemo(votingId, memo.id);

    this.emit('reconciliation:triggered', { votingId, memo });

    return memo;
  }

  /**
   * Generate conflict summary from voting results.
   */
  generateConflictSummary(voting: DualHouseVoting): ConflictSummary {
    const mocPassed = voting.mossCoinHouse.passed;
    const ossPassed = voting.openSourceHouse.passed;

    let mossCoinPosition: string;
    let openSourcePosition: string;

    if (mocPassed) {
      mossCoinPosition = `Approved with ${voting.mossCoinHouse.votesFor} votes for, ${voting.mossCoinHouse.votesAgainst} against (${voting.mossCoinHouse.participationRate.toFixed(1)}% participation)`;
    } else {
      mossCoinPosition = `Rejected with ${voting.mossCoinHouse.votesAgainst} votes against, ${voting.mossCoinHouse.votesFor} for (${voting.mossCoinHouse.participationRate.toFixed(1)}% participation)`;
    }

    if (ossPassed) {
      openSourcePosition = `Approved with ${voting.openSourceHouse.votesFor} votes for, ${voting.openSourceHouse.votesAgainst} against (${voting.openSourceHouse.participationRate.toFixed(1)}% participation)`;
    } else {
      openSourcePosition = `Rejected with ${voting.openSourceHouse.votesAgainst} votes against, ${voting.openSourceHouse.votesFor} for (${voting.openSourceHouse.participationRate.toFixed(1)}% participation)`;
    }

    const keyDisagreements: string[] = [];

    if (mocPassed !== ossPassed) {
      keyDisagreements.push(`Opposing outcomes: MossCoin ${mocPassed ? 'approved' : 'rejected'}, OpenSource ${ossPassed ? 'approved' : 'rejected'}`);
    }

    // Check quorum issues
    if (!voting.mossCoinHouse.quorumReached) {
      keyDisagreements.push('MossCoin House did not reach quorum');
    }
    if (!voting.openSourceHouse.quorumReached) {
      keyDisagreements.push('OpenSource House did not reach quorum');
    }

    // Check participation disparity
    const participationDiff = Math.abs(
      voting.mossCoinHouse.participationRate - voting.openSourceHouse.participationRate
    );
    if (participationDiff > 30) {
      keyDisagreements.push(`Significant participation disparity (${participationDiff.toFixed(1)}% difference)`);
    }

    return {
      mossCoinPosition,
      openSourcePosition,
      keyDisagreements,
      areasOfAgreement: [],
    };
  }

  // ==========================================
  // Orchestrator Analysis
  // ==========================================

  /**
   * Update orchestrator analysis for a reconciliation memo.
   */
  async updateOrchestratorAnalysis(
    memoId: string,
    analysis: OrchestratorAnalysis
  ): Promise<ReconciliationMemo> {
    const memo = await this.storage.getMemo(memoId);
    if (!memo) {
      throw new Error(`Reconciliation memo ${memoId} not found`);
    }

    if (memo.status !== 'pending') {
      throw new Error(`Cannot update analysis for memo in status: ${memo.status}`);
    }

    memo.orchestratorAnalysis = analysis;
    memo.updatedAt = new Date();

    // Auto-escalate to Director 3 if configured
    if (this.config.autoEscalateToDirector3) {
      memo.status = 'awaiting_director3';
      this.emit('reconciliation:director3_required', { memoId });
    }

    await this.storage.saveMemo(memo);
    this.emit('reconciliation:analysis_complete', { memoId, analysis });

    return memo;
  }

  /**
   * Generate recommendation based on voting results and conflict.
   */
  generateRecommendation(
    voting: DualHouseVoting,
    _conflictSummary: ConflictSummary
  ): ReconciliationRecommendation {
    const mocPassed = voting.mossCoinHouse.passed;
    const ossPassed = voting.openSourceHouse.passed;
    const mocParticipation = voting.mossCoinHouse.participationRate;
    const ossParticipation = voting.openSourceHouse.participationRate;
    const mocQuorum = voting.mossCoinHouse.quorumReached;
    const ossQuorum = voting.openSourceHouse.quorumReached;

    // If one house didn't reach quorum, favor the other
    if (!mocQuorum && ossQuorum) {
      return ossPassed ? 'favor_oss' : 'reject_both';
    }
    if (mocQuorum && !ossQuorum) {
      return mocPassed ? 'favor_moc' : 'reject_both';
    }
    if (!mocQuorum && !ossQuorum) {
      return 'reject_both';
    }

    // Both reached quorum but have opposite results
    if (mocPassed && !ossPassed) {
      // MossCoin approved, OpenSource rejected
      // If MossCoin has significantly higher participation, favor MOC
      if (mocParticipation > ossParticipation + 20) {
        return 'favor_moc';
      }
      // Try to find compromise
      return 'compromise';
    }

    if (!mocPassed && ossPassed) {
      // OpenSource approved, MossCoin rejected
      // If OpenSource has significantly higher participation, favor OSS
      if (ossParticipation > mocParticipation + 20) {
        return 'favor_oss';
      }
      // Try to find compromise
      return 'compromise';
    }

    // Both rejected
    return 'reject_both';
  }

  // ==========================================
  // Director 3 Decision
  // ==========================================

  /**
   * Submit Director 3 decision.
   */
  async submitDirector3Decision(
    memoId: string,
    decision: {
      director3Id: string;
      decision: Director3DecisionType;
      reasoning: string;
      conditions?: string[];
      signature?: string;
    }
  ): Promise<ReconciliationMemo> {
    const memo = await this.storage.getMemo(memoId);
    if (!memo) {
      throw new Error(`Reconciliation memo ${memoId} not found`);
    }

    // Validate Director 3
    if (this.config.director3Ids.length > 0 && !this.config.director3Ids.includes(decision.director3Id)) {
      throw new Error(`${decision.director3Id} is not authorized as Director 3`);
    }

    if (memo.status !== 'awaiting_director3') {
      throw new Error(`Cannot submit Director 3 decision for memo in status: ${memo.status}`);
    }

    const director3Decision: Director3Decision = {
      decision: decision.decision,
      reasoning: decision.reasoning,
      conditions: decision.conditions,
      timestamp: new Date(),
      director3Id: decision.director3Id,
      signature: decision.signature,
    };

    memo.director3Decision = director3Decision;
    memo.status = 'resolved';
    memo.resolvedAt = new Date();
    memo.updatedAt = new Date();

    await this.storage.saveMemo(memo);

    // Update voting status based on decision
    await this.applyDirector3Decision(memo);

    this.emit('reconciliation:director3_decided', { memoId, decision: director3Decision });
    this.emit('reconciliation:resolved', {
      memoId,
      outcome: `Director 3 decided: ${decision.decision}`,
    });

    return memo;
  }

  /**
   * Apply Director 3 decision to voting session.
   */
  private async applyDirector3Decision(memo: ReconciliationMemo): Promise<void> {
    if (!memo.director3Decision) return;

    const voting = await this.votingManager.getVoting(memo.votingId);
    if (!voting) return;

    switch (memo.director3Decision.decision) {
      case 'override_moc':
        // OpenSource House decision stands
        await this.votingManager.updateStatus(
          memo.votingId,
          voting.openSourceHouse.passed ? 'executed' : 'rejected'
        );
        break;

      case 'override_oss':
        // MossCoin House decision stands
        await this.votingManager.updateStatus(
          memo.votingId,
          voting.mossCoinHouse.passed ? 'executed' : 'rejected'
        );
        break;

      case 'revote':
        // Require new voting session
        await this.votingManager.updateStatus(memo.votingId, 'rejected');
        // Note: New voting session should be created separately
        break;

      case 'veto':
        // Director 3 vetoes the proposal entirely
        await this.votingManager.updateStatus(memo.votingId, 'vetoed');
        break;

      case 'approve_with_conditions':
        // Approved but with conditions attached
        await this.votingManager.updateStatus(memo.votingId, 'executed');
        // Note: Conditions should be tracked in execution
        break;
    }
  }

  // ==========================================
  // Query Methods
  // ==========================================

  /**
   * Get a reconciliation memo.
   */
  async getMemo(memoId: string): Promise<ReconciliationMemo | null> {
    return this.storage.getMemo(memoId);
  }

  /**
   * Get reconciliation memo by voting session.
   */
  async getMemoByVoting(votingId: string): Promise<ReconciliationMemo | null> {
    return this.storage.getMemoByVoting(votingId);
  }

  /**
   * List reconciliation memos.
   */
  async listMemos(options?: ListMemosOptions): Promise<ReconciliationMemo[]> {
    return this.storage.listMemos(options);
  }

  /**
   * Get memos awaiting Director 3 decision.
   */
  async getAwaitingDirector3(): Promise<ReconciliationMemo[]> {
    return this.storage.listMemos({ status: 'awaiting_director3' });
  }

  /**
   * Get pending memos.
   */
  async getPendingMemos(): Promise<ReconciliationMemo[]> {
    return this.storage.listMemos({ status: ['pending', 'awaiting_director3'] });
  }

  // ==========================================
  // Expiration Handling
  // ==========================================

  /**
   * Check and expire old reconciliation memos.
   */
  async expireOldMemos(): Promise<ReconciliationMemo[]> {
    const now = new Date();
    const pendingMemos = await this.storage.listMemos({
      status: ['pending', 'awaiting_director3'],
    });

    const expired: ReconciliationMemo[] = [];

    for (const memo of pendingMemos) {
      if (memo.expiresAt <= now) {
        memo.status = 'expired';
        memo.updatedAt = now;
        await this.storage.saveMemo(memo);

        // Update voting to rejected due to timeout
        await this.votingManager.updateStatus(memo.votingId, 'rejected');

        expired.push(memo);
        this.emit('reconciliation:expired', { memoId: memo.id });
      }
    }

    return expired;
  }

  /**
   * Extend reconciliation deadline.
   */
  async extendDeadline(memoId: string, additionalHours: number): Promise<ReconciliationMemo> {
    const memo = await this.storage.getMemo(memoId);
    if (!memo) {
      throw new Error(`Reconciliation memo ${memoId} not found`);
    }

    if (memo.status === 'resolved' || memo.status === 'expired') {
      throw new Error(`Cannot extend deadline for memo in status: ${memo.status}`);
    }

    memo.expiresAt = new Date(memo.expiresAt.getTime() + additionalHours * 60 * 60 * 1000);
    memo.updatedAt = new Date();

    await this.storage.saveMemo(memo);

    return memo;
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
   * Get Director 3 IDs.
   */
  getDirector3Ids(): string[] {
    return [...this.config.director3Ids];
  }

  /**
   * Check if an ID is a Director 3.
   */
  isDirector3(id: string): boolean {
    return this.config.director3Ids.length === 0 || this.config.director3Ids.includes(id);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a ReconciliationManager with in-memory storage.
 */
export function createReconciliationManager(
  votingManager: DualHouseVotingManager,
  config?: ReconciliationManagerConfig
): ReconciliationManager {
  const storage = new InMemoryReconciliationStorage();
  return new ReconciliationManager(storage, votingManager, config);
}

/**
 * Create a ReconciliationManager with custom storage.
 */
export function createReconciliationManagerWithStorage(
  storage: ReconciliationStorage,
  votingManager: DualHouseVotingManager,
  config?: ReconciliationManagerConfig
): ReconciliationManager {
  return new ReconciliationManager(storage, votingManager, config);
}
