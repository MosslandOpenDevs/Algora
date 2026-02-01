import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// Proposal status workflow
export type ProposalStatus =
  | 'draft'           // Initial creation, can be edited
  | 'pending_review'  // Submitted for agent review
  | 'discussion'      // Open for Agora discussion
  | 'voting'          // Active voting period
  | 'passed'          // Voting passed
  | 'rejected'        // Voting rejected
  | 'executed'        // Decision implemented
  | 'cancelled';      // Cancelled by proposer

// Proposal type enum
export type ProposalType = 'policy' | 'budget' | 'grant' | 'technical' | 'partnership' | 'operations' | 'general';

// Structured content interfaces
export interface ProposalContent {
  abstract?: {
    summary: string;
    decisionPoints?: string[];
  };
  background?: {
    currentSituation: string;
    limitations?: string;
    risks?: string;
  };
  objectives?: {
    goals: string[];
    kpis?: Array<{
      metric: string;
      target: string;
      current?: string;
    }>;
  };
  details?: {
    executionPlan: string;
    scope?: {
      inScope: string[];
      outOfScope?: string[];
    };
    alternatives?: Array<{
      title: string;
      description: string;
      pros: string[];
      cons: string[];
    }>;
  };
  governance?: {
    decisionMaker?: string;
    executor?: string;
    accountable?: string;
    consulted?: string[];
    informed?: string[];
  };
  reporting?: {
    cycle?: string;
    kpiTracking?: boolean;
    retroFunding?: boolean;
  };
  technicalSpecs?: string;
  notes?: string;
}

export interface ProposalBudget {
  total?: number;
  currency?: string;
  items?: Array<{
    category: string;
    amount: number;
    description?: string;
  }>;
  paymentMethod?: 'upfront' | 'milestone' | 'completion';
  milestones?: Array<{
    name: string;
    amount: number;
    criteria: string;
  }>;
}

export interface ProposalLink {
  type: 'document' | 'repo' | 'discussion' | 'external';
  title: string;
  url: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  proposer_type: 'human' | 'agent' | 'system';
  status: ProposalStatus;
  category: string;
  priority: string;
  issue_id?: string;
  decision_packet?: string;
  voting_starts?: string;
  voting_ends?: string;
  quorum_required: number;
  approval_threshold: number;
  tally?: string;
  execution_tx?: string;
  created_at: string;
  updated_at: string;
  // Extended fields (v2)
  proposal_type?: ProposalType;
  co_proposers?: string[];
  version?: number;
  execution_date?: string;
  content?: ProposalContent;
  budget?: ProposalBudget;
  related_links?: ProposalLink[];
}

export interface ProposalCreateInput {
  title: string;
  description: string;
  proposer: string;
  proposerType?: 'human' | 'agent' | 'system';
  category: string;
  priority?: string;
  issueId?: string;
  votingDurationHours?: number;
  quorumRequired?: number;
  approvalThreshold?: number;
  // Extended fields (v2)
  proposalType?: ProposalType;
  coProposers?: string[];
  executionDate?: string;
  content?: ProposalContent;
  budget?: ProposalBudget;
  relatedLinks?: ProposalLink[];
}

export class ProposalService {
  private db: Database.Database;
  private io: SocketServer;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeTables();
  }

  private initializeTables(): void {
    // Extend proposals table with additional columns
    this.db.exec(`
      -- Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
      CREATE TABLE IF NOT EXISTS proposal_history (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        changed_by TEXT,
        reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES proposals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_history_proposal ON proposal_history(proposal_id);

      -- Proposal comments/discussion
      CREATE TABLE IF NOT EXISTS proposal_comments (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_type TEXT NOT NULL,
        content TEXT NOT NULL,
        parent_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES proposals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal ON proposal_comments(proposal_id);

      -- Proposal endorsements from agents
      CREATE TABLE IF NOT EXISTS proposal_endorsements (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        stance TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        reasoning TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES proposals(id),
        FOREIGN KEY (agent_id) REFERENCES agents(id),
        UNIQUE(proposal_id, agent_id)
      );
    `);
  }

  // === Proposal CRUD ===

  create(input: ProposalCreateInput): Proposal {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Calculate voting period
    const votingDuration = input.votingDurationHours || 72; // Default 72 hours
    const votingStarts = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Start in 24h
    const votingEnds = new Date(Date.now() + (24 + votingDuration) * 60 * 60 * 1000).toISOString();

    // Serialize v2 fields to JSON
    const coProposersJson = input.coProposers ? JSON.stringify(input.coProposers) : null;
    const contentJson = input.content ? JSON.stringify(input.content) : null;
    const budgetJson = input.budget ? JSON.stringify(input.budget) : null;
    const relatedLinksJson = input.relatedLinks ? JSON.stringify(input.relatedLinks) : null;

    this.db.prepare(`
      INSERT INTO proposals (
        id, title, description, proposer, status, issue_id,
        voting_starts, voting_ends, created_at, updated_at,
        proposal_type, co_proposers, execution_date, content, budget, related_links
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title,
      input.description,
      input.proposer,
      input.issueId || null,
      votingStarts,
      votingEnds,
      now,
      now,
      input.proposalType || 'general',
      coProposersJson,
      input.executionDate || null,
      contentJson,
      budgetJson,
      relatedLinksJson
    );

    const proposal = this.getById(id)!;

    this.logActivity('PROPOSAL_CREATED', 'info', `New proposal: ${input.title}`, {
      proposalId: id,
      proposer: input.proposer,
    });

    this.io.emit('proposal:created', { proposal });

    return proposal;
  }

  getById(id: string): Proposal | null {
    const row = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as any;
    return row ? this.parseProposalRow(row) : null;
  }

  // Parse JSON fields from database row
  private parseProposalRow(row: any): Proposal {
    return {
      ...row,
      co_proposers: row.co_proposers ? JSON.parse(row.co_proposers) : undefined,
      content: row.content ? JSON.parse(row.content) : undefined,
      budget: row.budget ? JSON.parse(row.budget) : undefined,
      related_links: row.related_links ? JSON.parse(row.related_links) : undefined,
    };
  }

  getAll(options: {
    status?: ProposalStatus;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): Proposal[] {
    let query = 'SELECT * FROM proposals WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.category) {
      query += ' AND category = ?';
      params.push(options.category);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 50, options.offset || 0);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.parseProposalRow(row));
  }

  getActive(): Proposal[] {
    const rows = this.db.prepare(`
      SELECT * FROM proposals
      WHERE status IN ('discussion', 'voting', 'pending_review')
      ORDER BY
        CASE status
          WHEN 'voting' THEN 1
          WHEN 'discussion' THEN 2
          ELSE 3
        END,
        created_at DESC
    `).all() as any[];
    return rows.map(row => this.parseProposalRow(row));
  }

  // === Status Workflow ===

  updateStatus(id: string, newStatus: ProposalStatus, changedBy?: string, reason?: string): Proposal {
    const proposal = this.getById(id);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Validate status transition
    this.validateStatusTransition(proposal.status, newStatus);

    const now = new Date().toISOString();

    // Log status change
    this.db.prepare(`
      INSERT INTO proposal_history (id, proposal_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, proposal.status, newStatus, changedBy, reason);

    // Update proposal
    this.db.prepare(`
      UPDATE proposals SET status = ?, updated_at = ? WHERE id = ?
    `).run(newStatus, now, id);

    const updated = this.getById(id)!;

    this.io.emit('proposal:status_changed', {
      proposal: updated,
      from: proposal.status,
      to: newStatus,
    });

    return updated;
  }

  private validateStatusTransition(from: ProposalStatus, to: ProposalStatus): void {
    const validTransitions: Record<ProposalStatus, ProposalStatus[]> = {
      'draft': ['pending_review', 'cancelled'],
      'pending_review': ['discussion', 'draft', 'cancelled'],
      'discussion': ['voting', 'pending_review', 'cancelled'],
      'voting': ['passed', 'rejected'],
      'passed': ['executed'],
      'rejected': [],
      'executed': [],
      'cancelled': [],
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new Error(`Invalid status transition from ${from} to ${to}`);
    }
  }

  // === Proposal Actions ===

  submit(id: string, submittedBy: string): Proposal {
    return this.updateStatus(id, 'pending_review', submittedBy, 'Submitted for review');
  }

  startDiscussion(id: string, approvedBy: string): Proposal {
    return this.updateStatus(id, 'discussion', approvedBy, 'Approved for discussion');
  }

  startVoting(id: string): Proposal {
    const proposal = this.getById(id);
    if (!proposal) throw new Error('Proposal not found');

    const now = new Date().toISOString();

    // Update voting period to start now
    this.db.prepare(`
      UPDATE proposals
      SET voting_starts = ?, status = 'voting', updated_at = ?
      WHERE id = ?
    `).run(now, now, id);

    this.db.prepare(`
      INSERT INTO proposal_history (id, proposal_id, from_status, to_status, reason)
      VALUES (?, ?, 'discussion', 'voting', 'Voting period started')
    `).run(uuidv4(), id);

    const updated = this.getById(id)!;

    this.io.emit('proposal:voting_started', { proposal: updated });
    this.logActivity('VOTING_STARTED', 'info', `Voting started: ${proposal.title}`, { proposalId: id });

    return updated;
  }

  cancel(id: string, cancelledBy: string, reason: string): Proposal {
    return this.updateStatus(id, 'cancelled', cancelledBy, reason);
  }

  // === Comments ===

  addComment(proposalId: string, authorId: string, authorType: 'human' | 'agent', content: string, parentId?: string): any {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO proposal_comments (id, proposal_id, author_id, author_type, content, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, proposalId, authorId, authorType, content, parentId || null);

    const comment = this.db.prepare('SELECT * FROM proposal_comments WHERE id = ?').get(id);

    this.io.emit('proposal:comment_added', { proposalId, comment });

    return comment;
  }

  getComments(proposalId: string): any[] {
    return this.db.prepare(`
      SELECT pc.*,
        CASE pc.author_type
          WHEN 'agent' THEN a.display_name
          ELSE pc.author_id
        END as author_name
      FROM proposal_comments pc
      LEFT JOIN agents a ON pc.author_id = a.id AND pc.author_type = 'agent'
      WHERE pc.proposal_id = ?
      ORDER BY pc.created_at ASC
    `).all(proposalId);
  }

  // === Agent Endorsements ===

  addEndorsement(proposalId: string, agentId: string, stance: 'support' | 'oppose' | 'neutral', confidence: number, reasoning: string): any {
    const id = uuidv4();

    this.db.prepare(`
      INSERT OR REPLACE INTO proposal_endorsements (id, proposal_id, agent_id, stance, confidence, reasoning)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, proposalId, agentId, stance, confidence, reasoning);

    const endorsement = this.db.prepare(`
      SELECT pe.*, a.display_name as agent_name
      FROM proposal_endorsements pe
      JOIN agents a ON pe.agent_id = a.id
      WHERE pe.id = ?
    `).get(id);

    this.io.emit('proposal:endorsement_added', { proposalId, endorsement });

    return endorsement;
  }

  getEndorsements(proposalId: string): any[] {
    return this.db.prepare(`
      SELECT pe.*, a.display_name as agent_name, a.group_name as agent_group
      FROM proposal_endorsements pe
      JOIN agents a ON pe.agent_id = a.id
      WHERE pe.proposal_id = ?
      ORDER BY pe.confidence DESC
    `).all(proposalId);
  }

  // === Statistics ===

  getStats(): any {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM proposals').get() as { count: number };
    const byStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM proposals GROUP BY status
    `).all();
    const activeVoting = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals WHERE status = 'voting'
    `).get() as { count: number };
    const recentlyPassed = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals
      WHERE status = 'passed' AND updated_at > datetime('now', '-7 days')
    `).get() as { count: number };

    return {
      total: total.count,
      byStatus: Object.fromEntries(byStatus.map((r: any) => [r.status, r.count])),
      activeVoting: activeVoting.count,
      recentlyPassed: recentlyPassed.count,
    };
  }

  // === Auto-Progress & Resolution ===

  /**
   * Auto-progress draft proposals that have been idle for >24h and have linked Agora sessions.
   * draft → pending_review → discussion (if session completed with consensus)
   */
  autoProgressProposals(): { progressed: number; errors: string[] } {
    const result = { progressed: 0, errors: [] as string[] };

    // Find draft proposals older than 24h with completed Agora sessions
    const draftProposals = this.db.prepare(`
      SELECT p.id, p.title, p.issue_id, p.created_at,
        (SELECT MAX(s.current_round) FROM agora_sessions s WHERE s.issue_id = p.issue_id AND s.status = 'completed') as max_round
      FROM proposals p
      WHERE p.status = 'draft'
        AND p.created_at < datetime('now', '-24 hours')
        AND p.issue_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM agora_sessions s
          WHERE s.issue_id = p.issue_id AND s.status = 'completed' AND s.current_round >= 3
        )
      LIMIT 20
    `).all() as Array<{ id: string; title: string; issue_id: string; created_at: string; max_round: number }>;

    for (const proposal of draftProposals) {
      try {
        this.updateStatus(proposal.id, 'pending_review', 'auto-progress', 'Auto-progressed: linked Agora session completed');
        this.updateStatus(proposal.id, 'discussion', 'auto-progress', 'Auto-approved for discussion');
        result.progressed++;
        console.log(`[ProposalService] Auto-progressed proposal ${proposal.id.slice(0, 8)}: ${proposal.title}`);
      } catch (error) {
        result.errors.push(`${proposal.id.slice(0, 8)}: ${String(error)}`);
      }
    }

    return result;
  }

  /**
   * Resolve completed votings: transition voting → passed/rejected based on voting period end.
   * Also handles linked issue status updates.
   */
  resolveCompletedVotings(): { resolved: number; passed: number; rejected: number; errors: string[] } {
    const result = { resolved: 0, passed: 0, rejected: 0, errors: [] as string[] };

    // Find proposals whose voting period has ended
    const expiredVotings = this.db.prepare(`
      SELECT p.id, p.title, p.issue_id, p.voting_ends, p.tally
      FROM proposals p
      WHERE p.status = 'voting'
        AND p.voting_ends IS NOT NULL
        AND p.voting_ends < datetime('now')
      LIMIT 50
    `).all() as Array<{ id: string; title: string; issue_id: string | null; voting_ends: string; tally: string | null }>;

    for (const proposal of expiredVotings) {
      try {
        // Parse tally if available, otherwise default to passed (auto-approved via passive consensus)
        let passed = true;
        if (proposal.tally) {
          try {
            const tally = JSON.parse(proposal.tally);
            const forVotes = tally.for || 0;
            const againstVotes = tally.against || 0;
            const totalVotes = forVotes + againstVotes;
            // Pass if >50% for votes (or no votes = passive approval)
            passed = totalVotes === 0 || forVotes > againstVotes;
          } catch {
            // If tally is unparseable, default to passed
          }
        }

        const newStatus = passed ? 'passed' : 'rejected';
        this.updateStatus(proposal.id, newStatus, 'voting-resolver', `Voting period ended: ${newStatus}`);

        result.resolved++;
        if (passed) result.passed++;
        else result.rejected++;

        // Update linked issue status
        if (proposal.issue_id) {
          if (passed) {
            this.db.prepare(`
              UPDATE issues SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(proposal.issue_id);
          } else {
            // Rejected: revert issue to detected for re-discussion
            this.db.prepare(`
              UPDATE issues SET status = 'detected', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status IN ('in_progress', 'pending_vote', 'approved_for_action')
            `).run(proposal.issue_id);
          }

          this.io.emit('issue:updated', {
            issueId: proposal.issue_id,
            status: passed ? 'resolved' : 'detected',
            reason: `Proposal ${newStatus}`,
          });
        }

        console.log(`[ProposalService] Voting resolved: ${proposal.id.slice(0, 8)} → ${newStatus}`);
      } catch (error) {
        result.errors.push(`${proposal.id.slice(0, 8)}: ${String(error)}`);
      }
    }

    return result;
  }

  // === From Issue ===

  createFromIssue(issueId: string, proposer: string): Proposal {
    const issue = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as any;
    if (!issue) throw new Error('Issue not found');

    return this.create({
      title: `Proposal: ${issue.title}`,
      description: `## Background\n\n${issue.description}\n\n## Proposed Action\n\n[To be defined by proposer]`,
      proposer,
      category: issue.category,
      priority: issue.priority,
      issueId,
    });
  }

  // === History ===

  getHistory(proposalId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM proposal_history
      WHERE proposal_id = ?
      ORDER BY created_at ASC
    `).all(proposalId);
  }

  private logActivity(type: string, severity: string, message: string, details: any): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, severity, new Date().toISOString(), message, JSON.stringify(details));
  }
}
