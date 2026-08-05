import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { TokenService } from './token';
import { isoNow } from '../../utils/time';
import { recordActivity } from '../../activity';

type TokenVotingActivityType = 'TOKEN_VOTE_CAST' | 'TOKEN_VOTING_FINALIZED';

export interface TokenVote {
  id: string;
  proposalId: string;
  snapshotId: string;
  voter: string;
  walletAddress: string;
  choice: 'for' | 'against' | 'abstain';
  votingPower: number;
  tokenBalance: string;
  signature?: string;
  reason?: string;
  createdAt: string;
}

export interface TokenVoteTally {
  proposalId: string;
  snapshotId: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  totalVotingPower: number;
  totalEligiblePower: number;
  participationRate: number;
  quorumReached: boolean;
  quorumThreshold: number;
  result: 'pending' | 'passed' | 'rejected' | 'no_quorum';
}

export interface TokenProposalVoting {
  proposalId: string;
  snapshotId: string;
  votingStartsAt: string;
  votingEndsAt: string;
  quorumThreshold: number;
  passThreshold: number;
  status: 'pending' | 'active' | 'ended';
  createdAt: string;
}

export class TokenVotingService {
  private db: Database.Database;
  private io: SocketServer;
  private tokenService: TokenService;

  constructor(db: Database.Database, io: SocketServer, tokenService: TokenService) {
    this.db = db;
    this.io = io;
    this.tokenService = tokenService;
    this.initializeTables();
    console.log('[TokenVoting] Service initialized');
  }

  private initializeTables(): void {
    // Token votes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_votes (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        voter TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        choice TEXT NOT NULL,
        voting_power INTEGER NOT NULL,
        token_balance TEXT NOT NULL,
        signature TEXT,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(proposal_id, wallet_address)
      )
    `);

    // Token proposal voting settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_proposal_voting (
        id TEXT PRIMARY KEY,
        proposal_id TEXT UNIQUE NOT NULL,
        snapshot_id TEXT NOT NULL,
        voting_starts_at TEXT NOT NULL,
        voting_ends_at TEXT NOT NULL,
        quorum_threshold INTEGER DEFAULT 10,
        pass_threshold INTEGER DEFAULT 50,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_votes_proposal ON token_votes(proposal_id);
      CREATE INDEX IF NOT EXISTS idx_token_votes_wallet ON token_votes(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_token_proposal_voting_proposal ON token_proposal_voting(proposal_id);
    `);
  }

  // === Voting Setup ===

  async initializeVotingForProposal(
    proposalId: string,
    options: {
      votingDurationHours?: number;
      quorumThreshold?: number;
      passThreshold?: number;
    } = {}
  ): Promise<TokenProposalVoting> {
    const {
      votingDurationHours = 72, // 3 days default
      quorumThreshold = 10, // 10% of total voting power
      passThreshold = 50, // 50% to pass
    } = options;

    // Check if already initialized
    const existing = this.getProposalVoting(proposalId);
    if (existing) {
      throw new Error('Voting already initialized for this proposal');
    }

    // Create snapshot for this proposal
    const snapshot = await this.tokenService.createSnapshot(proposalId);

    const id = `tpv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const votingStartsAt = now.toISOString();
    const votingEndsAt = new Date(now.getTime() + votingDurationHours * 60 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO token_proposal_voting
        (id, proposal_id, snapshot_id, voting_starts_at, voting_ends_at, quorum_threshold, pass_threshold, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(id, proposalId, snapshot.id, votingStartsAt, votingEndsAt, quorumThreshold, passThreshold);

    const voting = this.getProposalVoting(proposalId)!;

    this.io.emit('token:voting_started', { proposalId, voting, snapshot });

    return voting;
  }

  getProposalVoting(proposalId: string): TokenProposalVoting | null {
    const row = this.db.prepare(`
      SELECT * FROM token_proposal_voting WHERE proposal_id = ?
    `).get(proposalId) as any;

    return row ? this.mapProposalVoting(row) : null;
  }

  // === Casting Votes ===

  async castVote(
    proposalId: string,
    walletAddress: string,
    choice: 'for' | 'against' | 'abstain',
    options: { signature?: string; reason?: string; voter?: string } = {}
  ): Promise<TokenVote> {
    const normalizedAddress = walletAddress.toLowerCase();

    // Get proposal voting settings
    const voting = this.getProposalVoting(proposalId);
    if (!voting) {
      throw new Error('Token voting not initialized for this proposal');
    }

    // Check if voting is active
    const now = new Date();
    if (now < new Date(voting.votingStartsAt)) {
      throw new Error('Voting has not started yet');
    }
    if (now > new Date(voting.votingEndsAt)) {
      throw new Error('Voting has ended');
    }
    if (voting.status !== 'active') {
      throw new Error('Voting is not active');
    }

    // Check if wallet is eligible
    if (!this.tokenService.isEligibleToVote(normalizedAddress)) {
      throw new Error('Wallet not eligible to vote (insufficient balance or not verified)');
    }

    // Get voting power from snapshot
    const snapshotBalance = this.tokenService.getSnapshotBalance(voting.snapshotId, normalizedAddress);
    if (!snapshotBalance) {
      throw new Error('Wallet not found in voting snapshot');
    }

    // Check for existing vote
    const existingVote = this.db.prepare(`
      SELECT id FROM token_votes WHERE proposal_id = ? AND wallet_address = ?
    `).get(proposalId, normalizedAddress);

    if (existingVote) {
      throw new Error('Already voted on this proposal');
    }

    const id = `tvote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO token_votes
        (id, proposal_id, snapshot_id, voter, wallet_address, choice, voting_power, token_balance, signature, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      proposalId,
      voting.snapshotId,
      options.voter || normalizedAddress,
      normalizedAddress,
      choice,
      snapshotBalance.votingPower,
      snapshotBalance.balance,
      options.signature,
      options.reason
    );

    const vote = this.getVote(id)!;

    this.io.emit('token:vote_cast', { proposalId, vote });

    // Log activity
    this.logActivity('TOKEN_VOTE_CAST', `Vote cast on proposal ${proposalId}`, {
      proposalId,
      walletAddress: normalizedAddress,
      choice,
      votingPower: snapshotBalance.votingPower,
    });

    return vote;
  }

  getVote(voteId: string): TokenVote | null {
    const row = this.db.prepare(`
      SELECT * FROM token_votes WHERE id = ?
    `).get(voteId) as any;

    return row ? this.mapVote(row) : null;
  }

  getVoteByWallet(proposalId: string, walletAddress: string): TokenVote | null {
    const row = this.db.prepare(`
      SELECT * FROM token_votes WHERE proposal_id = ? AND wallet_address = ?
    `).get(proposalId, walletAddress.toLowerCase()) as any;

    return row ? this.mapVote(row) : null;
  }

  listVotesForProposal(proposalId: string): TokenVote[] {
    const rows = this.db.prepare(`
      SELECT * FROM token_votes WHERE proposal_id = ? ORDER BY created_at DESC
    `).all(proposalId) as any[];

    return rows.map(row => this.mapVote(row));
  }

  // === Vote Tallying ===

  calculateTally(proposalId: string): TokenVoteTally {
    const voting = this.getProposalVoting(proposalId);
    if (!voting) {
      throw new Error('Token voting not initialized for this proposal');
    }

    const votes = this.db.prepare(`
      SELECT
        SUM(CASE WHEN choice = 'for' THEN voting_power ELSE 0 END) as for_votes,
        SUM(CASE WHEN choice = 'against' THEN voting_power ELSE 0 END) as against_votes,
        SUM(CASE WHEN choice = 'abstain' THEN voting_power ELSE 0 END) as abstain_votes,
        SUM(voting_power) as total_power
      FROM token_votes
      WHERE proposal_id = ?
    `).get(proposalId) as any;

    // Get total eligible voting power from snapshot
    const totalEligible = this.db.prepare(`
      SELECT SUM(voting_power) as total FROM snapshot_balances WHERE snapshot_id = ?
    `).get(voting.snapshotId) as { total: number };

    const forVotes = votes?.for_votes || 0;
    const againstVotes = votes?.against_votes || 0;
    const abstainVotes = votes?.abstain_votes || 0;
    const totalVotingPower = votes?.total_power || 0;
    const totalEligiblePower = totalEligible?.total || 0;

    const participationRate = totalEligiblePower > 0
      ? (totalVotingPower / totalEligiblePower) * 100
      : 0;

    const quorumReached = participationRate >= voting.quorumThreshold;

    // Calculate result
    let result: 'pending' | 'passed' | 'rejected' | 'no_quorum' = 'pending';
    const now = new Date();
    const votingEnded = now > new Date(voting.votingEndsAt);

    if (votingEnded) {
      if (!quorumReached) {
        result = 'no_quorum';
      } else {
        const totalDecisionVotes = forVotes + againstVotes;
        const forPercentage = totalDecisionVotes > 0 ? (forVotes / totalDecisionVotes) * 100 : 0;
        result = forPercentage >= voting.passThreshold ? 'passed' : 'rejected';
      }
    }

    return {
      proposalId,
      snapshotId: voting.snapshotId,
      forVotes,
      againstVotes,
      abstainVotes,
      totalVotingPower,
      totalEligiblePower,
      participationRate,
      quorumReached,
      quorumThreshold: voting.quorumThreshold,
      result,
    };
  }

  // === Finalization ===

  async finalizeVoting(proposalId: string): Promise<TokenVoteTally> {
    const voting = this.getProposalVoting(proposalId);
    if (!voting) {
      throw new Error('Token voting not initialized for this proposal');
    }

    const now = new Date();
    if (now < new Date(voting.votingEndsAt)) {
      throw new Error('Voting period has not ended yet');
    }

    if (voting.status === 'ended') {
      throw new Error('Voting already finalized');
    }

    // Calculate final tally
    const tally = this.calculateTally(proposalId);

    // Update voting status
    this.db.prepare(`
      UPDATE token_proposal_voting
      SET status = 'ended', updated_at = datetime('now')
      WHERE proposal_id = ?
    `).run(proposalId);

    this.io.emit('token:voting_finalized', { proposalId, tally });

    // Log activity
    this.logActivity('TOKEN_VOTING_FINALIZED', `Token voting finalized for proposal ${proposalId}`, {
      proposalId,
      result: tally.result,
      forVotes: tally.forVotes,
      againstVotes: tally.againstVotes,
      participationRate: tally.participationRate,
    });

    return tally;
  }

  // === Batch Refresh ===

  async refreshAllVotingPower(): Promise<{ updated: number; errors: number }> {
    const holders = this.tokenService.listHolders({ limit: 10000 });
    let updated = 0;
    let errors = 0;

    for (const holder of holders) {
      try {
        await this.tokenService.refreshHolderBalance(holder.id);
        updated++;
      } catch (error) {
        errors++;
        console.error(`[TokenVoting] Failed to refresh ${holder.walletAddress}:`, error);
      }
    }

    return { updated, errors };
  }

  // === Stats ===

  getStats(): any {
    const votingStats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT proposal_id) as proposals_with_voting,
        COUNT(*) as total_votes,
        SUM(voting_power) as total_voting_power_used,
        AVG(voting_power) as avg_voting_power_per_vote
      FROM token_votes
    `).get() as any;

    const activeVoting = this.db.prepare(`
      SELECT COUNT(*) as count FROM token_proposal_voting
      WHERE status = 'active' AND voting_ends_at > ?
    `).get(isoNow()) as { count: number };

    const results = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'ended' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM token_proposal_voting
    `).get() as any;

    return {
      proposalsWithVoting: votingStats?.proposals_with_voting || 0,
      totalVotes: votingStats?.total_votes || 0,
      totalVotingPowerUsed: votingStats?.total_voting_power_used || 0,
      avgVotingPowerPerVote: votingStats?.avg_voting_power_per_vote || 0,
      activeVoting: activeVoting.count,
      completedVoting: results?.completed || 0,
      pendingVoting: results?.pending || 0,
    };
  }

  // === Helpers ===

  private logActivity(type: TokenVotingActivityType, message: string, metadata: any): void {
    try {
      recordActivity(this.db, { type, severity: 'info', message, metadata });
    } catch (error) {
      console.error('[TokenVoting] Failed to log activity:', error);
    }
  }

  private mapVote(row: any): TokenVote {
    return {
      id: row.id,
      proposalId: row.proposal_id,
      snapshotId: row.snapshot_id,
      voter: row.voter,
      walletAddress: row.wallet_address,
      choice: row.choice,
      votingPower: row.voting_power,
      tokenBalance: row.token_balance,
      signature: row.signature,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }

  private mapProposalVoting(row: any): TokenProposalVoting {
    return {
      proposalId: row.proposal_id,
      snapshotId: row.snapshot_id,
      votingStartsAt: row.voting_starts_at,
      votingEndsAt: row.voting_ends_at,
      quorumThreshold: row.quorum_threshold,
      passThreshold: row.pass_threshold,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
