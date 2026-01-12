// ===========================================
// House Definitions and Member Management
// ===========================================

import {
  HouseType,
  HouseConfig,
  HouseMember,
  MossCoinMember,
  OpenSourceMember,
  HouseStats,
  MOSSCOIN_HOUSE_CONFIG,
  OPENSOURCE_HOUSE_CONFIG,
} from './types.js';

// ============================================
// Storage Interface
// ============================================

/**
 * Storage interface for house data.
 */
export interface HouseStorage {
  // Member operations
  getMember(house: HouseType, memberId: string): Promise<HouseMember | null>;
  getMemberByWallet(walletAddress: string): Promise<MossCoinMember | null>;
  getMemberByGithub(githubUsername: string): Promise<OpenSourceMember | null>;
  saveMember(house: HouseType, member: HouseMember): Promise<void>;
  deleteMember(house: HouseType, memberId: string): Promise<void>;
  listMembers(house: HouseType, options?: ListMembersOptions): Promise<HouseMember[]>;
  countMembers(house: HouseType): Promise<number>;

  // Stats operations
  getStats(house: HouseType): Promise<HouseStats | null>;
  saveStats(stats: HouseStats): Promise<void>;
}

/**
 * Options for listing members.
 */
export interface ListMembersOptions {
  status?: 'active' | 'inactive' | 'suspended';
  minVotingPower?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'votingPower' | 'joinedAt' | 'lastActiveAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// In-Memory Storage Implementation
// ============================================

/**
 * In-memory storage for development/testing.
 */
export class InMemoryHouseStorage implements HouseStorage {
  private mossCoinMembers: Map<string, MossCoinMember> = new Map();
  private openSourceMembers: Map<string, OpenSourceMember> = new Map();
  private stats: Map<HouseType, HouseStats> = new Map();

  async getMember(house: HouseType, memberId: string): Promise<HouseMember | null> {
    const members = house === 'mosscoin' ? this.mossCoinMembers : this.openSourceMembers;
    return members.get(memberId) || null;
  }

  async getMemberByWallet(walletAddress: string): Promise<MossCoinMember | null> {
    for (const member of this.mossCoinMembers.values()) {
      if (member.walletAddress === walletAddress) {
        return member;
      }
    }
    return null;
  }

  async getMemberByGithub(githubUsername: string): Promise<OpenSourceMember | null> {
    for (const member of this.openSourceMembers.values()) {
      if (member.githubUsername === githubUsername) {
        return member;
      }
    }
    return null;
  }

  async saveMember(house: HouseType, member: HouseMember): Promise<void> {
    if (house === 'mosscoin') {
      this.mossCoinMembers.set(member.id, member as MossCoinMember);
    } else {
      this.openSourceMembers.set(member.id, member as OpenSourceMember);
    }
  }

  async deleteMember(house: HouseType, memberId: string): Promise<void> {
    if (house === 'mosscoin') {
      this.mossCoinMembers.delete(memberId);
    } else {
      this.openSourceMembers.delete(memberId);
    }
  }

  async listMembers(house: HouseType, options?: ListMembersOptions): Promise<HouseMember[]> {
    let filtered: HouseMember[] = house === 'mosscoin'
      ? Array.from(this.mossCoinMembers.values())
      : Array.from(this.openSourceMembers.values());

    // Apply filters
    if (options?.status) {
      filtered = filtered.filter(m => m.status === options.status);
    }
    if (options?.minVotingPower !== undefined) {
      filtered = filtered.filter(m => m.votingPower >= options.minVotingPower!);
    }

    // Apply sorting
    if (options?.sortBy) {
      filtered.sort((a, b) => {
        let aVal: number | Date;
        let bVal: number | Date;

        switch (options.sortBy) {
          case 'votingPower':
            aVal = a.votingPower;
            bVal = b.votingPower;
            break;
          case 'joinedAt':
            aVal = a.joinedAt;
            bVal = b.joinedAt;
            break;
          case 'lastActiveAt':
            aVal = a.lastActiveAt || new Date(0);
            bVal = b.lastActiveAt || new Date(0);
            break;
          default:
            return 0;
        }

        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return options.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // Apply pagination
    if (options?.offset !== undefined) {
      filtered = filtered.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async countMembers(house: HouseType): Promise<number> {
    return house === 'mosscoin'
      ? this.mossCoinMembers.size
      : this.openSourceMembers.size;
  }

  async getStats(house: HouseType): Promise<HouseStats | null> {
    return this.stats.get(house) || null;
  }

  async saveStats(stats: HouseStats): Promise<void> {
    this.stats.set(stats.house, stats);
  }

  // Clear all data (for testing)
  clear(): void {
    this.mossCoinMembers.clear();
    this.openSourceMembers.clear();
    this.stats.clear();
  }
}

// ============================================
// House Manager
// ============================================

/**
 * Events emitted by HouseManager.
 */
export interface HouseManagerEvents {
  'member:joined': { house: HouseType; member: HouseMember };
  'member:left': { house: HouseType; memberId: string };
  'member:updated': { house: HouseType; member: HouseMember };
  'member:suspended': { house: HouseType; memberId: string; reason: string };
  'member:reactivated': { house: HouseType; memberId: string };
  'power:updated': { house: HouseType; memberId: string; oldPower: number; newPower: number };
  'stats:updated': { house: HouseType; stats: HouseStats };
}

/**
 * Event handler type.
 */
type HouseManagerEventHandler<K extends keyof HouseManagerEvents> = (
  data: HouseManagerEvents[K]
) => void;

/**
 * Configuration for HouseManager.
 */
export interface HouseManagerConfig {
  mossCoinHouse?: HouseConfig;
  openSourceHouse?: HouseConfig;
  minTokenBalance?: number;
  minContributionScore?: number;
  inactivityThresholdDays?: number;
}

/**
 * Manages house memberships and voting power.
 */
export class HouseManager {
  private storage: HouseStorage;
  private config: Required<HouseManagerConfig>;
  private eventHandlers: Map<keyof HouseManagerEvents, Set<HouseManagerEventHandler<keyof HouseManagerEvents>>> = new Map();

  constructor(storage: HouseStorage, config?: HouseManagerConfig) {
    this.storage = storage;
    this.config = {
      mossCoinHouse: config?.mossCoinHouse || MOSSCOIN_HOUSE_CONFIG,
      openSourceHouse: config?.openSourceHouse || OPENSOURCE_HOUSE_CONFIG,
      minTokenBalance: config?.minTokenBalance || 1,
      minContributionScore: config?.minContributionScore || 10,
      inactivityThresholdDays: config?.inactivityThresholdDays || 90,
    };
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof HouseManagerEvents>(
    event: K,
    handler: HouseManagerEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as HouseManagerEventHandler<keyof HouseManagerEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof HouseManagerEvents>(
    event: K,
    handler: HouseManagerEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as HouseManagerEventHandler<keyof HouseManagerEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof HouseManagerEvents>(
    event: K,
    data: HouseManagerEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Configuration
  // ==========================================

  /**
   * Get house configuration.
   */
  getHouseConfig(house: HouseType): HouseConfig {
    return house === 'mosscoin'
      ? this.config.mossCoinHouse
      : this.config.openSourceHouse;
  }

  /**
   * Update house configuration.
   */
  updateHouseConfig(house: HouseType, updates: Partial<HouseConfig>): void {
    if (house === 'mosscoin') {
      this.config.mossCoinHouse = { ...this.config.mossCoinHouse, ...updates };
    } else {
      this.config.openSourceHouse = { ...this.config.openSourceHouse, ...updates };
    }
  }

  // ==========================================
  // MossCoin House Member Operations
  // ==========================================

  /**
   * Register a new MossCoin House member.
   */
  async registerMossCoinMember(data: {
    walletAddress: string;
    name?: string;
    tokenBalance: number;
  }): Promise<MossCoinMember> {
    // Validate minimum token balance
    if (data.tokenBalance < this.config.minTokenBalance) {
      throw new Error(
        `Token balance ${data.tokenBalance} is below minimum ${this.config.minTokenBalance}`
      );
    }

    // Check if already registered
    const existing = await this.storage.getMemberByWallet(data.walletAddress);
    if (existing) {
      throw new Error(`Wallet ${data.walletAddress} is already registered`);
    }

    const member: MossCoinMember = {
      id: `moc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: data.name,
      walletAddress: data.walletAddress,
      votingPower: this.calculateMossCoinVotingPower(data.tokenBalance, 0),
      joinedAt: new Date(),
      status: 'active',
      tokenBalance: data.tokenBalance,
      delegatedPower: 0,
      hasDelegated: false,
    };

    await this.storage.saveMember('mosscoin', member);
    this.emit('member:joined', { house: 'mosscoin', member });

    return member;
  }

  /**
   * Update MossCoin member token balance.
   */
  async updateMossCoinBalance(
    memberId: string,
    newBalance: number
  ): Promise<MossCoinMember> {
    const member = await this.storage.getMember('mosscoin', memberId) as MossCoinMember | null;
    if (!member) {
      throw new Error(`MossCoin member ${memberId} not found`);
    }

    const oldPower = member.votingPower;
    member.tokenBalance = newBalance;
    member.votingPower = this.calculateMossCoinVotingPower(
      newBalance,
      member.delegatedPower
    );
    member.lastActiveAt = new Date();

    // Check if member should be deactivated due to low balance
    if (newBalance < this.config.minTokenBalance) {
      member.status = 'inactive';
    } else if (member.status === 'inactive') {
      member.status = 'active';
    }

    await this.storage.saveMember('mosscoin', member);

    if (oldPower !== member.votingPower) {
      this.emit('power:updated', {
        house: 'mosscoin',
        memberId,
        oldPower,
        newPower: member.votingPower,
      });
    }

    this.emit('member:updated', { house: 'mosscoin', member });

    return member;
  }

  /**
   * Calculate MossCoin voting power.
   * Base: 1 vote per token, plus delegated power.
   */
  private calculateMossCoinVotingPower(tokenBalance: number, delegatedPower: number): number {
    // Token-weighted: each token = 1 voting power
    return tokenBalance + delegatedPower;
  }

  // ==========================================
  // OpenSource House Member Operations
  // ==========================================

  /**
   * Register a new OpenSource House member.
   */
  async registerOpenSourceMember(data: {
    githubUsername: string;
    name?: string;
    contributionScore: number;
    commits?: number;
    pullRequests?: number;
    communityPoints?: number;
    roles?: string[];
  }): Promise<OpenSourceMember> {
    // Validate minimum contribution score
    if (data.contributionScore < this.config.minContributionScore) {
      throw new Error(
        `Contribution score ${data.contributionScore} is below minimum ${this.config.minContributionScore}`
      );
    }

    // Check if already registered
    const existing = await this.storage.getMemberByGithub(data.githubUsername);
    if (existing) {
      throw new Error(`GitHub user ${data.githubUsername} is already registered`);
    }

    const member: OpenSourceMember = {
      id: `oss-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: data.name,
      githubUsername: data.githubUsername,
      votingPower: this.calculateOpenSourceVotingPower(data.contributionScore, data.roles || []),
      joinedAt: new Date(),
      status: 'active',
      contributionScore: data.contributionScore,
      commits: data.commits || 0,
      pullRequests: data.pullRequests || 0,
      communityPoints: data.communityPoints || 0,
      roles: data.roles || [],
    };

    await this.storage.saveMember('opensource', member);
    this.emit('member:joined', { house: 'opensource', member });

    return member;
  }

  /**
   * Update OpenSource member contribution metrics.
   */
  async updateOpenSourceContributions(
    memberId: string,
    updates: {
      contributionScore?: number;
      commits?: number;
      pullRequests?: number;
      communityPoints?: number;
      roles?: string[];
    }
  ): Promise<OpenSourceMember> {
    const member = await this.storage.getMember('opensource', memberId) as OpenSourceMember | null;
    if (!member) {
      throw new Error(`OpenSource member ${memberId} not found`);
    }

    const oldPower = member.votingPower;

    if (updates.contributionScore !== undefined) {
      member.contributionScore = updates.contributionScore;
    }
    if (updates.commits !== undefined) {
      member.commits = updates.commits;
    }
    if (updates.pullRequests !== undefined) {
      member.pullRequests = updates.pullRequests;
    }
    if (updates.communityPoints !== undefined) {
      member.communityPoints = updates.communityPoints;
    }
    if (updates.roles !== undefined) {
      member.roles = updates.roles;
    }

    member.votingPower = this.calculateOpenSourceVotingPower(
      member.contributionScore,
      member.roles
    );
    member.lastActiveAt = new Date();

    // Check if member should be deactivated
    if (member.contributionScore < this.config.minContributionScore) {
      member.status = 'inactive';
    } else if (member.status === 'inactive') {
      member.status = 'active';
    }

    await this.storage.saveMember('opensource', member);

    if (oldPower !== member.votingPower) {
      this.emit('power:updated', {
        house: 'opensource',
        memberId,
        oldPower,
        newPower: member.votingPower,
      });
    }

    this.emit('member:updated', { house: 'opensource', member });

    return member;
  }

  /**
   * Calculate OpenSource voting power.
   * Base: contribution score with role multipliers.
   */
  private calculateOpenSourceVotingPower(contributionScore: number, roles: string[]): number {
    let power = contributionScore;

    // Role multipliers
    const roleMultipliers: Record<string, number> = {
      maintainer: 1.5,
      core_contributor: 1.3,
      reviewer: 1.2,
      moderator: 1.1,
    };

    for (const role of roles) {
      const multiplier = roleMultipliers[role.toLowerCase()];
      if (multiplier) {
        power *= multiplier;
      }
    }

    return Math.floor(power);
  }

  // ==========================================
  // Common Member Operations
  // ==========================================

  /**
   * Get a member by ID.
   */
  async getMember(house: HouseType, memberId: string): Promise<HouseMember | null> {
    return this.storage.getMember(house, memberId);
  }

  /**
   * Get MossCoin member by wallet.
   */
  async getMemberByWallet(walletAddress: string): Promise<MossCoinMember | null> {
    return this.storage.getMemberByWallet(walletAddress);
  }

  /**
   * Get OpenSource member by GitHub username.
   */
  async getMemberByGithub(githubUsername: string): Promise<OpenSourceMember | null> {
    return this.storage.getMemberByGithub(githubUsername);
  }

  /**
   * List members with filtering and pagination.
   */
  async listMembers(house: HouseType, options?: ListMembersOptions): Promise<HouseMember[]> {
    return this.storage.listMembers(house, options);
  }

  /**
   * Get active member count.
   */
  async getActiveMemberCount(house: HouseType): Promise<number> {
    const members = await this.storage.listMembers(house, { status: 'active' });
    return members.length;
  }

  /**
   * Get total voting power for a house.
   */
  async getTotalVotingPower(house: HouseType): Promise<number> {
    const members = await this.storage.listMembers(house, { status: 'active' });
    return members.reduce((sum, m) => sum + m.votingPower, 0);
  }

  /**
   * Suspend a member.
   */
  async suspendMember(house: HouseType, memberId: string, reason: string): Promise<void> {
    const member = await this.storage.getMember(house, memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in ${house} house`);
    }

    member.status = 'suspended';
    await this.storage.saveMember(house, member);
    this.emit('member:suspended', { house, memberId, reason });
  }

  /**
   * Reactivate a suspended member.
   */
  async reactivateMember(house: HouseType, memberId: string): Promise<void> {
    const member = await this.storage.getMember(house, memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in ${house} house`);
    }

    if (member.status !== 'suspended') {
      throw new Error(`Member ${memberId} is not suspended`);
    }

    member.status = 'active';
    await this.storage.saveMember(house, member);
    this.emit('member:reactivated', { house, memberId });
  }

  /**
   * Remove a member from a house.
   */
  async removeMember(house: HouseType, memberId: string): Promise<void> {
    const member = await this.storage.getMember(house, memberId);
    if (!member) {
      throw new Error(`Member ${memberId} not found in ${house} house`);
    }

    await this.storage.deleteMember(house, memberId);
    this.emit('member:left', { house, memberId });
  }

  /**
   * Mark inactive members.
   */
  async markInactiveMembers(house: HouseType): Promise<number> {
    const members = await this.storage.listMembers(house, { status: 'active' });
    const threshold = Date.now() - this.config.inactivityThresholdDays * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const member of members) {
      const lastActive = member.lastActiveAt?.getTime() || member.joinedAt.getTime();
      if (lastActive < threshold) {
        member.status = 'inactive';
        await this.storage.saveMember(house, member);
        count++;
      }
    }

    return count;
  }

  // ==========================================
  // Statistics
  // ==========================================

  /**
   * Calculate and update house statistics.
   */
  async calculateStats(house: HouseType): Promise<HouseStats> {
    const allMembers = await this.storage.listMembers(house);
    const activeMembers = allMembers.filter(m => m.status === 'active');

    // Calculate 30-day activity
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyActive = allMembers.filter(m => {
      const lastActive = m.lastActiveAt?.getTime() || 0;
      return lastActive > thirtyDaysAgo;
    });

    const stats: HouseStats = {
      house,
      totalMembers: allMembers.length,
      activeMembers: activeMembers.length,
      totalVotingPower: activeMembers.reduce((sum, m) => sum + m.votingPower, 0),
      averageParticipation: 0, // Calculated by voting system
      totalVotesCast: 0, // Calculated by voting system
      proposalsPassed: 0, // Calculated by voting system
      proposalsRejected: 0, // Calculated by voting system
    };

    // Additional metadata
    (stats as HouseStats & { recentlyActiveMembers: number }).recentlyActiveMembers = recentlyActive.length;

    await this.storage.saveStats(stats);
    this.emit('stats:updated', { house, stats });

    return stats;
  }

  /**
   * Get house statistics.
   */
  async getStats(house: HouseType): Promise<HouseStats | null> {
    return this.storage.getStats(house);
  }

  /**
   * Check if a member can vote.
   */
  canVote(member: HouseMember): boolean {
    return member.status === 'active' && member.votingPower > 0;
  }

  /**
   * Check quorum for a house.
   */
  async checkQuorum(house: HouseType, participatingPower: number): Promise<boolean> {
    const config = this.getHouseConfig(house);
    const totalPower = await this.getTotalVotingPower(house);
    const quorumRequired = (totalPower * config.quorumPercentage) / 100;
    return participatingPower >= quorumRequired;
  }

  /**
   * Check if a vote passes threshold.
   */
  checkPassThreshold(
    house: HouseType,
    votesFor: number,
    votesAgainst: number
  ): boolean {
    const config = this.getHouseConfig(house);
    const totalVotes = votesFor + votesAgainst;
    if (totalVotes === 0) return false;

    const forPercentage = (votesFor / totalVotes) * 100;
    return forPercentage >= config.passThreshold;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a HouseManager with in-memory storage.
 */
export function createHouseManager(config?: HouseManagerConfig): HouseManager {
  const storage = new InMemoryHouseStorage();
  return new HouseManager(storage, config);
}

/**
 * Create a HouseManager with custom storage.
 */
export function createHouseManagerWithStorage(
  storage: HouseStorage,
  config?: HouseManagerConfig
): HouseManager {
  return new HouseManager(storage, config);
}
