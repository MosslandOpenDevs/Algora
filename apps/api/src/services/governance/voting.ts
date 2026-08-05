import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type { AuditService } from '../audit';
import { isoNow, isoHoursAgo } from '../../utils/time';

export type VoteChoice = 'for' | 'against' | 'abstain';

export interface Vote {
  id: string;
  proposal_id: string;
  voter: string;
  voter_type: 'human' | 'agent';
  choice: VoteChoice;
  weight: number;
  reason?: string;
  delegated_from?: string;
  created_at: string;
}

export interface VoteTally {
  for: { weight: number; count: number };
  against: { weight: number; count: number };
  abstain: { weight: number; count: number };
  total_weight: number;
  total_votes: number;
  quorum_reached: boolean;
  outcome: 'pending' | 'passed' | 'rejected' | 'no_quorum';
}

export interface Delegation {
  id: string;
  delegator: string;
  delegate: string;
  categories?: string[];
  weight: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

export class VotingService {
  private db: Database.Database;
  private io: SocketServer;
  private audit: AuditService | null = null;

  // Default governance parameters
  private readonly DEFAULT_QUORUM = 0.1; // 10% of total weight
  private readonly DEFAULT_APPROVAL_THRESHOLD = 0.5; // Simple majority

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeTables();
  }

  setAuditService(audit: AuditService): void {
    this.audit = audit;
  }

  private initializeTables(): void {
    this.db.exec(`
      -- Voter registry with voting power
      CREATE TABLE IF NOT EXISTS voter_registry (
        id TEXT PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        display_name TEXT,
        voting_power REAL DEFAULT 1.0,
        total_votes_cast INTEGER DEFAULT 0,
        reputation_score REAL DEFAULT 50.0,
        is_verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Vote receipts for audit trail
      CREATE TABLE IF NOT EXISTS vote_receipts (
        id TEXT PRIMARY KEY,
        vote_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        voter TEXT NOT NULL,
        choice TEXT NOT NULL,
        weight REAL NOT NULL,
        signature TEXT,
        block_number INTEGER,
        tx_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vote_id) REFERENCES votes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_vote_receipts_proposal ON vote_receipts(proposal_id);
    `);
  }

  // === Voting ===

  castVote(
    proposalId: string,
    voter: string,
    _voterType: 'human' | 'agent',
    choice: VoteChoice,
    reason?: string
  ): Vote {
    // Check if proposal is in voting status
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId) as any;
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'voting') throw new Error('Proposal is not in voting phase');

    // Check voting period
    const now = new Date();
    if (proposal.voting_ends && new Date(proposal.voting_ends) < now) {
      throw new Error('Voting period has ended');
    }

    // Get voter's voting power
    const weight = this.getVotingPower(voter);

    // Check for existing vote
    const existingVote = this.db.prepare(
      'SELECT id FROM votes WHERE proposal_id = ? AND voter = ?'
    ).get(proposalId, voter);

    const voteId = existingVote ? (existingVote as any).id : uuidv4();

    // Cast or update vote
    this.db.prepare(`
      INSERT OR REPLACE INTO votes (id, proposal_id, voter, choice, weight, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(voteId, proposalId, voter, choice, weight, reason, new Date().toISOString());

    // Process delegated votes
    this.processDelegatedVotes(proposalId, voter, choice, reason);

    // Update tally
    const tally = this.calculateTally(proposalId);
    this.db.prepare('UPDATE proposals SET tally = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(tally), new Date().toISOString(), proposalId);

    const vote = this.db.prepare('SELECT * FROM votes WHERE id = ?').get(voteId) as Vote;

    this.io.emit('vote:cast', { proposalId, vote, tally });
    this.logActivity('VOTE_CAST', 'info', `Vote cast on proposal`, { proposalId, voter, choice });
    this.audit?.append({
      type: 'VOTE_CAST',
      actor: voter,
      subjectId: proposalId,
      payload: { voteId, choice, weight, reason: reason ?? null },
    });

    // Check if voting should be finalized
    this.checkAutoFinalize(proposalId, proposal);

    return vote;
  }

  private processDelegatedVotes(proposalId: string, delegate: string, choice: VoteChoice, reason?: string): void {
    // Get all active delegations to this voter
    // expires_at is ISO-'T' — see utils/time.ts for why datetime('now')
    // cannot be compared against it.
    const delegations = this.db.prepare(`
      SELECT * FROM delegations
      WHERE delegate = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > ?)
    `).all(delegate, isoNow()) as Delegation[];

    for (const delegation of delegations) {
      // Check if delegator hasn't voted directly
      const directVote = this.db.prepare(
        'SELECT id FROM votes WHERE proposal_id = ? AND voter = ?'
      ).get(proposalId, delegation.delegator);

      if (!directVote) {
        const delegatedVoteId = uuidv4();
        this.db.prepare(`
          INSERT INTO votes (id, proposal_id, voter, choice, weight, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          delegatedVoteId,
          proposalId,
          delegation.delegator,
          choice,
          delegation.weight || 1,
          `Delegated vote via ${delegate}: ${reason || 'No reason provided'}`,
          new Date().toISOString()
        );
      }
    }
  }

  getVotingPower(voter: string): number {
    const registry = this.db.prepare(
      'SELECT voting_power FROM voter_registry WHERE address = ?'
    ).get(voter) as { voting_power: number } | undefined;

    return registry?.voting_power || 1.0;
  }

  // === Tally Calculation ===

  calculateTally(proposalId: string): VoteTally {
    const votes = this.db.prepare(`
      SELECT choice, SUM(weight) as total_weight, COUNT(*) as vote_count
      FROM votes
      WHERE proposal_id = ?
      GROUP BY choice
    `).all(proposalId) as any[];

    const tally: VoteTally = {
      for: { weight: 0, count: 0 },
      against: { weight: 0, count: 0 },
      abstain: { weight: 0, count: 0 },
      total_weight: 0,
      total_votes: 0,
      quorum_reached: false,
      outcome: 'pending',
    };

    for (const v of votes) {
      if (v.choice in tally) {
        (tally as any)[v.choice] = {
          weight: v.total_weight,
          count: v.vote_count,
        };
      }
      tally.total_weight += v.total_weight;
      tally.total_votes += v.vote_count;
    }

    // Check quorum (using registered voter total or default)
    const totalVotingPower = this.getTotalVotingPower();
    tally.quorum_reached = tally.total_weight >= totalVotingPower * this.DEFAULT_QUORUM;

    // Determine outcome
    if (tally.quorum_reached) {
      const votesNeeded = (tally.for.weight + tally.against.weight) * this.DEFAULT_APPROVAL_THRESHOLD;
      if (tally.for.weight > votesNeeded) {
        tally.outcome = 'passed';
      } else if (tally.against.weight >= votesNeeded) {
        tally.outcome = 'rejected';
      }
    }

    return tally;
  }

  private getTotalVotingPower(): number {
    const result = this.db.prepare(
      'SELECT SUM(voting_power) as total FROM voter_registry WHERE is_verified = 1'
    ).get() as { total: number } | undefined;

    return result?.total || 100; // Default if no registered voters
  }

  private checkAutoFinalize(proposalId: string, proposal: any): void {
    const now = new Date();
    const votingEnds = proposal.voting_ends ? new Date(proposal.voting_ends) : null;

    // Auto-finalize if voting period ended
    if (votingEnds && votingEnds < now && proposal.status === 'voting') {
      this.finalizeVoting(proposalId);
    }
  }

  // === Finalization ===

  finalizeVoting(proposalId: string): VoteTally {
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId) as any;
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'voting') throw new Error('Proposal is not in voting phase');

    const tally = this.calculateTally(proposalId);
    const now = new Date().toISOString();

    let newStatus: string;
    if (!tally.quorum_reached) {
      newStatus = 'rejected'; // No quorum = rejected
      tally.outcome = 'no_quorum';
    } else if (tally.outcome === 'passed') {
      newStatus = 'passed';
    } else {
      newStatus = 'rejected';
    }

    this.db.prepare(`
      UPDATE proposals SET status = ?, tally = ?, updated_at = ? WHERE id = ?
    `).run(newStatus, JSON.stringify(tally), now, proposalId);

    // Log status change
    this.db.prepare(`
      INSERT INTO proposal_history (id, proposal_id, from_status, to_status, reason)
      VALUES (?, ?, 'voting', ?, ?)
    `).run(uuidv4(), proposalId, newStatus, `Voting finalized: ${tally.outcome}`);

    this.io.emit('proposal:voting_finalized', { proposalId, status: newStatus, tally });
    this.logActivity('VOTING_FINALIZED', 'info', `Voting finalized: ${proposal.title}`, {
      proposalId,
      outcome: tally.outcome,
      tally,
    });
    this.audit?.append({
      type: 'PROPOSAL_FINALIZED',
      actor: 'system',
      subjectId: proposalId,
      payload: { status: newStatus, tally },
    });

    return tally;
  }

  // === Delegation ===

  createDelegation(delegator: string, delegate: string, categories?: string[], expiresAt?: string): Delegation {
    const id = uuidv4();
    const weight = this.getVotingPower(delegator);

    this.db.prepare(`
      INSERT INTO delegations (id, delegator, delegate, categories, expires_at, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      delegator,
      delegate,
      categories ? JSON.stringify(categories) : null,
      expiresAt,
      new Date().toISOString()
    );

    const delegation = this.db.prepare('SELECT * FROM delegations WHERE id = ?').get(id) as Delegation;

    this.io.emit('delegation:created', { delegation });
    this.logActivity('DELEGATION_CREATED', 'info', `Voting power delegated`, {
      delegator,
      delegate,
      weight,
    });
    this.audit?.append({
      type: 'DELEGATION_CREATED',
      actor: delegator,
      subjectId: id,
      payload: { delegate, categories: categories ?? null, weight, expiresAt: expiresAt ?? null },
    });

    return delegation;
  }

  revokeDelegation(delegationId: string): void {
    const existing = this.db.prepare(
      'SELECT delegator, delegate FROM delegations WHERE id = ?'
    ).get(delegationId) as { delegator?: string; delegate?: string } | undefined;
    this.db.prepare('UPDATE delegations SET is_active = 0 WHERE id = ?').run(delegationId);
    this.io.emit('delegation:revoked', { delegationId });
    this.audit?.append({
      type: 'DELEGATION_REVOKED',
      actor: existing?.delegator ?? 'unknown',
      subjectId: delegationId,
      payload: { delegate: existing?.delegate ?? null },
    });
  }

  getDelegations(address: string): { delegatedTo: Delegation[]; delegatedFrom: Delegation[] } {
    const delegatedTo = this.db.prepare(`
      SELECT * FROM delegations WHERE delegator = ? AND is_active = 1
    `).all(address) as Delegation[];

    const delegatedFrom = this.db.prepare(`
      SELECT * FROM delegations WHERE delegate = ? AND is_active = 1
    `).all(address) as Delegation[];

    return { delegatedTo, delegatedFrom };
  }

  getDelegationById(id: string): Delegation | null {
    const row = this.db.prepare('SELECT * FROM delegations WHERE id = ?').get(id) as Delegation | undefined;
    return row ?? null;
  }

  // === Voter Registry ===

  registerVoter(address: string, displayName?: string, votingPower?: number): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO voter_registry (id, address, display_name, voting_power, is_verified, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(uuidv4(), address, displayName, votingPower || 1.0, new Date().toISOString());
  }

  getVoterInfo(address: string): any {
    return this.db.prepare('SELECT * FROM voter_registry WHERE address = ?').get(address);
  }

  // === Query Methods ===

  getVotesForProposal(proposalId: string): Vote[] {
    return this.db.prepare(`
      SELECT * FROM votes WHERE proposal_id = ? ORDER BY created_at DESC
    `).all(proposalId) as Vote[];
  }

  hasVoted(proposalId: string, voter: string): boolean {
    const vote = this.db.prepare(
      'SELECT id FROM votes WHERE proposal_id = ? AND voter = ?'
    ).get(proposalId, voter);
    return !!vote;
  }

  getVotingStats(): any {
    const totalVotes = this.db.prepare('SELECT COUNT(*) as count FROM votes').get() as { count: number };
    const totalVoters = this.db.prepare('SELECT COUNT(DISTINCT voter) as count FROM votes').get() as { count: number };
    const recentVotes = this.db.prepare(`
      SELECT COUNT(*) as count FROM votes WHERE created_at > ?
    `).get(isoHoursAgo(24)) as { count: number };
    const avgParticipation = this.db.prepare(`
      SELECT AVG(vote_count) as avg FROM (
        SELECT COUNT(*) as vote_count FROM votes GROUP BY proposal_id
      )
    `).get() as { avg: number };

    return {
      totalVotes: totalVotes.count,
      totalVoters: totalVoters.count,
      votesLast24h: recentVotes.count,
      avgVotesPerProposal: Math.round(avgParticipation?.avg || 0),
    };
  }

  private logActivity(type: string, severity: string, message: string, details: any): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, severity, new Date().toISOString(), message, JSON.stringify(details));
  }
}
