// ===========================================
// Dual-House Voting System
// ===========================================

import {
  HouseType,
  Vote,
  VoteChoice,
  HouseVoteTally,
  DualHouseVoting,
  DualHouseStatus,
  VoteDelegation,
  VotingPeriodConfig,
  DEFAULT_VOTING_PERIOD,
} from './types.js';
import { HouseManager } from './houses.js';

// ============================================
// Storage Interface
// ============================================

/**
 * Storage interface for voting data.
 */
export interface VotingStorage {
  // Voting session operations
  getVoting(votingId: string): Promise<DualHouseVoting | null>;
  saveVoting(voting: DualHouseVoting): Promise<void>;
  listVotings(options?: ListVotingsOptions): Promise<DualHouseVoting[]>;
  countVotings(options?: ListVotingsOptions): Promise<number>;

  // Vote operations
  getVote(voteId: string): Promise<Vote | null>;
  getVoteByMemberAndVoting(memberId: string, votingId: string, house: HouseType): Promise<Vote | null>;
  saveVote(vote: Vote): Promise<void>;
  listVotes(votingId: string, house?: HouseType): Promise<Vote[]>;

  // Delegation operations
  getDelegation(delegationId: string): Promise<VoteDelegation | null>;
  getActiveDelegation(delegatorId: string, house: HouseType, scope: {
    type: 'all' | 'category' | 'proposal';
    value?: string;
  }): Promise<VoteDelegation | null>;
  saveDelegation(delegation: VoteDelegation): Promise<void>;
  listDelegations(delegateId: string, house: HouseType): Promise<VoteDelegation[]>;
}

/**
 * Options for listing voting sessions.
 */
export interface ListVotingsOptions {
  status?: DualHouseStatus | DualHouseStatus[];
  proposalId?: string;
  category?: string;
  startAfter?: Date;
  endBefore?: Date;
  limit?: number;
  offset?: number;
}

// ============================================
// In-Memory Storage Implementation
// ============================================

/**
 * In-memory storage for development/testing.
 */
export class InMemoryVotingStorage implements VotingStorage {
  private votings: Map<string, DualHouseVoting> = new Map();
  private votes: Map<string, Vote> = new Map();
  private delegations: Map<string, VoteDelegation> = new Map();

  async getVoting(votingId: string): Promise<DualHouseVoting | null> {
    return this.votings.get(votingId) || null;
  }

  async saveVoting(voting: DualHouseVoting): Promise<void> {
    this.votings.set(voting.id, voting);
  }

  async listVotings(options?: ListVotingsOptions): Promise<DualHouseVoting[]> {
    let votings = Array.from(this.votings.values());

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      votings = votings.filter(v => statuses.includes(v.status));
    }
    if (options?.proposalId) {
      votings = votings.filter(v => v.proposalId === options.proposalId);
    }
    if (options?.category) {
      votings = votings.filter(v => v.category === options.category);
    }
    if (options?.startAfter) {
      votings = votings.filter(v => v.startedAt > options.startAfter!);
    }
    if (options?.endBefore) {
      votings = votings.filter(v => v.endsAt < options.endBefore!);
    }

    // Sort by start time descending
    votings.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    if (options?.offset !== undefined) {
      votings = votings.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      votings = votings.slice(0, options.limit);
    }

    return votings;
  }

  async countVotings(options?: ListVotingsOptions): Promise<number> {
    const votings = await this.listVotings({ ...options, limit: undefined, offset: undefined });
    return votings.length;
  }

  async getVote(voteId: string): Promise<Vote | null> {
    return this.votes.get(voteId) || null;
  }

  async getVoteByMemberAndVoting(
    memberId: string,
    votingId: string,
    house: HouseType
  ): Promise<Vote | null> {
    for (const vote of this.votes.values()) {
      if (
        vote.memberId === memberId &&
        vote.votingId === votingId &&
        vote.house === house
      ) {
        return vote;
      }
    }
    return null;
  }

  async saveVote(vote: Vote): Promise<void> {
    this.votes.set(vote.id, vote);
  }

  async listVotes(votingId: string, house?: HouseType): Promise<Vote[]> {
    const votes: Vote[] = [];
    for (const vote of this.votes.values()) {
      if (vote.votingId === votingId) {
        if (!house || vote.house === house) {
          votes.push(vote);
        }
      }
    }
    return votes;
  }

  async getDelegation(delegationId: string): Promise<VoteDelegation | null> {
    return this.delegations.get(delegationId) || null;
  }

  async getActiveDelegation(
    delegatorId: string,
    house: HouseType,
    scope: { type: 'all' | 'category' | 'proposal'; value?: string }
  ): Promise<VoteDelegation | null> {
    for (const delegation of this.delegations.values()) {
      if (
        delegation.delegatorId === delegatorId &&
        delegation.house === house &&
        delegation.active &&
        delegation.scope === scope.type
      ) {
        // Check scope match
        if (scope.type === 'all') {
          return delegation;
        }
        if (scope.type === 'category' && delegation.category === scope.value) {
          return delegation;
        }
        if (scope.type === 'proposal' && delegation.proposalId === scope.value) {
          return delegation;
        }
      }
    }
    return null;
  }

  async saveDelegation(delegation: VoteDelegation): Promise<void> {
    this.delegations.set(delegation.id, delegation);
  }

  async listDelegations(delegateId: string, house: HouseType): Promise<VoteDelegation[]> {
    const delegations: VoteDelegation[] = [];
    for (const delegation of this.delegations.values()) {
      if (
        delegation.delegateId === delegateId &&
        delegation.house === house &&
        delegation.active
      ) {
        delegations.push(delegation);
      }
    }
    return delegations;
  }

  // Clear all data (for testing)
  clear(): void {
    this.votings.clear();
    this.votes.clear();
    this.delegations.clear();
  }
}

// ============================================
// Voting Manager
// ============================================

/**
 * Events emitted by DualHouseVotingManager.
 */
export interface VotingManagerEvents {
  'voting:created': { voting: DualHouseVoting };
  'voting:started': { votingId: string };
  'voting:vote_cast': { vote: Vote };
  'voting:quorum_reached': { votingId: string; house: HouseType };
  'voting:finalized': { voting: DualHouseVoting };
  'voting:status_changed': { votingId: string; oldStatus: DualHouseStatus; newStatus: DualHouseStatus };
  'delegation:created': { delegation: VoteDelegation };
  'delegation:revoked': { delegationId: string };
}

/**
 * Event handler type.
 */
type VotingEventHandler<K extends keyof VotingManagerEvents> = (
  data: VotingManagerEvents[K]
) => void;

/**
 * Configuration for DualHouseVotingManager.
 */
export interface VotingManagerConfig {
  votingPeriod?: VotingPeriodConfig;
  enableEarlyFinalization?: boolean;
}

/**
 * Manages dual-house voting sessions.
 */
export class DualHouseVotingManager {
  private storage: VotingStorage;
  private houseManager: HouseManager;
  private config: Required<VotingManagerConfig>;
  private eventHandlers: Map<keyof VotingManagerEvents, Set<VotingEventHandler<keyof VotingManagerEvents>>> = new Map();

  constructor(
    storage: VotingStorage,
    houseManager: HouseManager,
    config?: VotingManagerConfig
  ) {
    this.storage = storage;
    this.houseManager = houseManager;
    this.config = {
      votingPeriod: config?.votingPeriod || DEFAULT_VOTING_PERIOD,
      enableEarlyFinalization: config?.enableEarlyFinalization ?? true,
    };
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof VotingManagerEvents>(
    event: K,
    handler: VotingEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as VotingEventHandler<keyof VotingManagerEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof VotingManagerEvents>(
    event: K,
    handler: VotingEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as VotingEventHandler<keyof VotingManagerEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof VotingManagerEvents>(
    event: K,
    data: VotingManagerEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Voting Session Management
  // ==========================================

  /**
   * Create a new dual-house voting session.
   */
  async createVoting(params: {
    proposalId: string;
    title: string;
    summary: string;
    riskLevel: 'LOW' | 'MID' | 'HIGH';
    category: string;
    createdBy: string;
    durationHours?: number;
    metadata?: Record<string, unknown>;
  }): Promise<DualHouseVoting> {
    const durationHours = params.durationHours || this.config.votingPeriod.durationHours;

    // Validate duration
    if (durationHours < this.config.votingPeriod.minDurationHours) {
      throw new Error(
        `Duration ${durationHours}h is below minimum ${this.config.votingPeriod.minDurationHours}h`
      );
    }
    if (durationHours > this.config.votingPeriod.maxDurationHours) {
      throw new Error(
        `Duration ${durationHours}h exceeds maximum ${this.config.votingPeriod.maxDurationHours}h`
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    // Get total possible voting power for each house
    const mocTotalPower = await this.houseManager.getTotalVotingPower('mosscoin');
    const ossTotalPower = await this.houseManager.getTotalVotingPower('opensource');

    const voting: DualHouseVoting = {
      id: `vote-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: params.proposalId,
      title: params.title,
      summary: params.summary,
      riskLevel: params.riskLevel,
      category: params.category,
      mossCoinHouse: {
        house: 'mosscoin',
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        totalVotes: 0,
        totalPossiblePower: mocTotalPower,
        participationRate: 0,
        quorumReached: false,
        passed: false,
      },
      openSourceHouse: {
        house: 'opensource',
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        totalVotes: 0,
        totalPossiblePower: ossTotalPower,
        participationRate: 0,
        quorumReached: false,
        passed: false,
      },
      status: 'voting',
      requiresReconciliation: false,
      startedAt: now,
      endsAt,
      createdBy: params.createdBy,
      metadata: params.metadata,
    };

    await this.storage.saveVoting(voting);
    this.emit('voting:created', { voting });
    this.emit('voting:started', { votingId: voting.id });

    return voting;
  }

  /**
   * Get a voting session.
   */
  async getVoting(votingId: string): Promise<DualHouseVoting | null> {
    return this.storage.getVoting(votingId);
  }

  /**
   * List voting sessions.
   */
  async listVotings(options?: ListVotingsOptions): Promise<DualHouseVoting[]> {
    return this.storage.listVotings(options);
  }

  // ==========================================
  // Vote Casting
  // ==========================================

  /**
   * Cast a vote.
   */
  async castVote(params: {
    votingId: string;
    house: HouseType;
    memberId: string;
    choice: VoteChoice;
    comment?: string;
    signature?: string;
  }): Promise<Vote> {
    // Get voting session
    const voting = await this.storage.getVoting(params.votingId);
    if (!voting) {
      throw new Error(`Voting session ${params.votingId} not found`);
    }

    // Check voting is active
    if (voting.status !== 'voting') {
      throw new Error(`Voting session is not active (status: ${voting.status})`);
    }

    // Check voting period
    const now = new Date();
    if (now > voting.endsAt) {
      throw new Error('Voting period has ended');
    }

    // Get member
    const member = await this.houseManager.getMember(params.house, params.memberId);
    if (!member) {
      throw new Error(`Member ${params.memberId} not found in ${params.house} house`);
    }

    // Check member can vote
    if (!this.houseManager.canVote(member)) {
      throw new Error(`Member ${params.memberId} cannot vote (status: ${member.status})`);
    }

    // Check for existing vote
    const existingVote = await this.storage.getVoteByMemberAndVoting(
      params.memberId,
      params.votingId,
      params.house
    );
    if (existingVote) {
      throw new Error(`Member ${params.memberId} has already voted`);
    }

    // Check for delegation - if member delegated, they can't vote directly
    const delegation = await this.storage.getActiveDelegation(
      params.memberId,
      params.house,
      { type: 'all' }
    );
    if (delegation) {
      throw new Error(`Member ${params.memberId} has delegated their vote`);
    }

    // Calculate voting power (including received delegations)
    const votingPower = await this.calculateVotingPower(
      params.memberId,
      params.house,
      params.votingId
    );

    // Create vote
    const vote: Vote = {
      id: `v-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      votingId: params.votingId,
      house: params.house,
      memberId: params.memberId,
      choice: params.choice,
      votingPower,
      comment: params.comment,
      timestamp: now,
      signature: params.signature,
    };

    await this.storage.saveVote(vote);

    // Update tallies
    await this.updateTallies(params.votingId);

    this.emit('voting:vote_cast', { vote });

    // Check for quorum
    const updatedVoting = await this.storage.getVoting(params.votingId);
    if (updatedVoting) {
      const tally = params.house === 'mosscoin'
        ? updatedVoting.mossCoinHouse
        : updatedVoting.openSourceHouse;
      if (tally.quorumReached) {
        this.emit('voting:quorum_reached', { votingId: params.votingId, house: params.house });
      }

      // Check for early finalization
      if (this.config.enableEarlyFinalization) {
        await this.checkEarlyFinalization(params.votingId);
      }
    }

    return vote;
  }

  /**
   * Calculate voting power for a member, including delegations.
   */
  private async calculateVotingPower(
    memberId: string,
    house: HouseType,
    _votingId: string
  ): Promise<number> {
    // Get base voting power
    const member = await this.houseManager.getMember(house, memberId);
    if (!member) return 0;

    let power = member.votingPower;

    // Add delegated power
    const delegations = await this.storage.listDelegations(memberId, house);
    for (const delegation of delegations) {
      power += delegation.votingPower;
    }

    return power;
  }

  /**
   * Update vote tallies for a voting session.
   */
  private async updateTallies(votingId: string): Promise<void> {
    const voting = await this.storage.getVoting(votingId);
    if (!voting) return;

    // Calculate MossCoin House tally
    const mocVotes = await this.storage.listVotes(votingId, 'mosscoin');
    voting.mossCoinHouse = this.calculateTally('mosscoin', mocVotes, voting.mossCoinHouse.totalPossiblePower);

    // Calculate OpenSource House tally
    const ossVotes = await this.storage.listVotes(votingId, 'opensource');
    voting.openSourceHouse = this.calculateTally('opensource', ossVotes, voting.openSourceHouse.totalPossiblePower);

    await this.storage.saveVoting(voting);
  }

  /**
   * Calculate tally for a house.
   */
  private calculateTally(house: HouseType, votes: Vote[], totalPossiblePower: number): HouseVoteTally {
    let votesFor = 0;
    let votesAgainst = 0;
    let votesAbstain = 0;

    for (const vote of votes) {
      switch (vote.choice) {
        case 'for':
          votesFor += vote.votingPower;
          break;
        case 'against':
          votesAgainst += vote.votingPower;
          break;
        case 'abstain':
          votesAbstain += vote.votingPower;
          break;
      }
    }

    const totalVotes = votesFor + votesAgainst + votesAbstain;
    const participationRate = totalPossiblePower > 0
      ? (totalVotes / totalPossiblePower) * 100
      : 0;

    const config = this.houseManager.getHouseConfig(house);
    const quorumReached = participationRate >= config.quorumPercentage;
    const passed = quorumReached && this.houseManager.checkPassThreshold(house, votesFor, votesAgainst);

    return {
      house,
      votesFor,
      votesAgainst,
      votesAbstain,
      totalVotes,
      totalPossiblePower,
      participationRate,
      quorumReached,
      passed,
    };
  }

  // ==========================================
  // Finalization
  // ==========================================

  /**
   * Check if early finalization is possible.
   */
  private async checkEarlyFinalization(votingId: string): Promise<void> {
    if (!this.config.votingPeriod.allowEarlyFinalization) return;

    const voting = await this.storage.getVoting(votingId);
    if (!voting || voting.status !== 'voting') return;

    // Check if both houses have reached early finalization quorum
    const earlyQuorum = this.config.votingPeriod.earlyFinalizationQuorum;
    if (
      voting.mossCoinHouse.participationRate >= earlyQuorum &&
      voting.openSourceHouse.participationRate >= earlyQuorum
    ) {
      await this.finalizeVoting(votingId);
    }
  }

  /**
   * Finalize a voting session.
   */
  async finalizeVoting(votingId: string): Promise<DualHouseVoting> {
    const voting = await this.storage.getVoting(votingId);
    if (!voting) {
      throw new Error(`Voting session ${votingId} not found`);
    }

    if (voting.status !== 'voting') {
      throw new Error(`Cannot finalize voting in status: ${voting.status}`);
    }

    // Update tallies one final time
    await this.updateTallies(votingId);

    // Re-fetch with updated tallies
    const updatedVoting = (await this.storage.getVoting(votingId))!;
    const oldStatus = updatedVoting.status;

    // Determine final status
    const mocPassed = updatedVoting.mossCoinHouse.passed;
    const ossPassed = updatedVoting.openSourceHouse.passed;

    if (mocPassed && ossPassed) {
      updatedVoting.status = 'both_passed';
    } else if (mocPassed && !ossPassed) {
      updatedVoting.status = 'moc_only';
      updatedVoting.requiresReconciliation = true;
    } else if (!mocPassed && ossPassed) {
      updatedVoting.status = 'oss_only';
      updatedVoting.requiresReconciliation = true;
    } else {
      updatedVoting.status = 'rejected';
    }

    updatedVoting.finalizedAt = new Date();

    await this.storage.saveVoting(updatedVoting);

    if (oldStatus !== updatedVoting.status) {
      this.emit('voting:status_changed', {
        votingId,
        oldStatus,
        newStatus: updatedVoting.status,
      });
    }

    this.emit('voting:finalized', { voting: updatedVoting });

    return updatedVoting;
  }

  /**
   * Check and finalize expired voting sessions.
   */
  async finalizeExpiredVotings(): Promise<DualHouseVoting[]> {
    const now = new Date();
    const activeVotings = await this.storage.listVotings({ status: 'voting' });
    const finalized: DualHouseVoting[] = [];

    for (const voting of activeVotings) {
      if (voting.endsAt <= now) {
        const result = await this.finalizeVoting(voting.id);
        finalized.push(result);
      }
    }

    return finalized;
  }

  // ==========================================
  // Delegation
  // ==========================================

  /**
   * Create a vote delegation.
   */
  async createDelegation(params: {
    house: HouseType;
    delegatorId: string;
    delegateId: string;
    scope: 'all' | 'category' | 'proposal';
    category?: string;
    proposalId?: string;
    expiresAt?: Date;
  }): Promise<VoteDelegation> {
    // Validate delegator exists and can vote
    const delegator = await this.houseManager.getMember(params.house, params.delegatorId);
    if (!delegator) {
      throw new Error(`Delegator ${params.delegatorId} not found`);
    }
    if (!this.houseManager.canVote(delegator)) {
      throw new Error(`Delegator ${params.delegatorId} cannot vote`);
    }

    // Validate delegate exists
    const delegate = await this.houseManager.getMember(params.house, params.delegateId);
    if (!delegate) {
      throw new Error(`Delegate ${params.delegateId} not found`);
    }

    // Prevent self-delegation
    if (params.delegatorId === params.delegateId) {
      throw new Error('Cannot delegate to self');
    }

    // Check for existing delegation
    const existingScope = {
      type: params.scope,
      value: params.scope === 'category' ? params.category : params.proposalId,
    };
    const existing = await this.storage.getActiveDelegation(
      params.delegatorId,
      params.house,
      existingScope
    );
    if (existing) {
      throw new Error('Active delegation already exists for this scope');
    }

    // Validate scope parameters
    if (params.scope === 'category' && !params.category) {
      throw new Error('Category is required for category-scoped delegation');
    }
    if (params.scope === 'proposal' && !params.proposalId) {
      throw new Error('Proposal ID is required for proposal-scoped delegation');
    }

    const delegation: VoteDelegation = {
      id: `del-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      house: params.house,
      delegatorId: params.delegatorId,
      delegateId: params.delegateId,
      votingPower: delegator.votingPower,
      scope: params.scope,
      category: params.category,
      proposalId: params.proposalId,
      active: true,
      createdAt: new Date(),
      expiresAt: params.expiresAt,
    };

    await this.storage.saveDelegation(delegation);
    this.emit('delegation:created', { delegation });

    return delegation;
  }

  /**
   * Revoke a delegation.
   */
  async revokeDelegation(delegationId: string): Promise<void> {
    const delegation = await this.storage.getDelegation(delegationId);
    if (!delegation) {
      throw new Error(`Delegation ${delegationId} not found`);
    }

    if (!delegation.active) {
      throw new Error('Delegation is already inactive');
    }

    delegation.active = false;
    delegation.revokedAt = new Date();

    await this.storage.saveDelegation(delegation);
    this.emit('delegation:revoked', { delegationId });
  }

  /**
   * Get delegations received by a member.
   */
  async getDelegationsReceived(memberId: string, house: HouseType): Promise<VoteDelegation[]> {
    return this.storage.listDelegations(memberId, house);
  }

  // ==========================================
  // Query Methods
  // ==========================================

  /**
   * Get votes for a voting session.
   */
  async getVotes(votingId: string, house?: HouseType): Promise<Vote[]> {
    return this.storage.listVotes(votingId, house);
  }

  /**
   * Check if a member has voted.
   */
  async hasVoted(memberId: string, votingId: string, house: HouseType): Promise<boolean> {
    const vote = await this.storage.getVoteByMemberAndVoting(memberId, votingId, house);
    return vote !== null;
  }

  /**
   * Get member's vote.
   */
  async getMemberVote(memberId: string, votingId: string, house: HouseType): Promise<Vote | null> {
    return this.storage.getVoteByMemberAndVoting(memberId, votingId, house);
  }

  /**
   * Get active voting sessions.
   */
  async getActiveVotings(): Promise<DualHouseVoting[]> {
    return this.storage.listVotings({ status: 'voting' });
  }

  /**
   * Get voting sessions requiring reconciliation.
   */
  async getVotingsRequiringReconciliation(): Promise<DualHouseVoting[]> {
    return this.storage.listVotings({ status: ['moc_only', 'oss_only', 'reconciliation'] });
  }

  /**
   * Update voting status.
   */
  async updateStatus(votingId: string, newStatus: DualHouseStatus): Promise<void> {
    const voting = await this.storage.getVoting(votingId);
    if (!voting) {
      throw new Error(`Voting session ${votingId} not found`);
    }

    const oldStatus = voting.status;
    voting.status = newStatus;

    await this.storage.saveVoting(voting);

    if (oldStatus !== newStatus) {
      this.emit('voting:status_changed', { votingId, oldStatus, newStatus });
    }
  }

  /**
   * Set reconciliation memo ID.
   */
  async setReconciliationMemo(votingId: string, memoId: string): Promise<void> {
    const voting = await this.storage.getVoting(votingId);
    if (!voting) {
      throw new Error(`Voting session ${votingId} not found`);
    }

    voting.reconciliationMemoId = memoId;
    voting.status = 'reconciliation';

    await this.storage.saveVoting(voting);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a DualHouseVotingManager with in-memory storage.
 */
export function createVotingManager(
  houseManager: HouseManager,
  config?: VotingManagerConfig
): DualHouseVotingManager {
  const storage = new InMemoryVotingStorage();
  return new DualHouseVotingManager(storage, houseManager, config);
}

/**
 * Create a DualHouseVotingManager with custom storage.
 */
export function createVotingManagerWithStorage(
  storage: VotingStorage,
  houseManager: HouseManager,
  config?: VotingManagerConfig
): DualHouseVotingManager {
  return new DualHouseVotingManager(storage, houseManager, config);
}
