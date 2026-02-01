// ===========================================
// Governance OS Bridge Service
// ===========================================
// Connects existing apps/api services to v2.0 packages

import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { EventEmitter } from 'events';

// Import GovernanceOS and related packages
import {
  createGovernanceOS,
  type GovernanceOS,
  type PipelineResult,
} from '@algora/governance-os';

import type { RiskLevel, ActionType } from '@algora/safe-autonomy';
import { classifyAction } from '@algora/safe-autonomy';
import type { Issue as OrchestratorIssue, WorkflowType, TopicCategory } from '@algora/orchestrator';
import type { DocumentType, Document } from '@algora/document-registry';
import type { DualHouseVoting, HighRiskApproval, VoteChoice, HouseType } from '@algora/dual-house';
import type { Task, TaskType, DifficultyLevel } from '@algora/model-router';

// Import existing services for integration
import { llmService } from './llm.js';
import { GovernanceStorage } from './governance-storage.js';

// ============================================
// Types
// ============================================

interface BridgeConfig {
  /** Enable automatic pipeline execution for detected issues */
  autoPipelineOnIssue: boolean;
  /** Risk level threshold for automatic pipeline */
  autoPipelineRiskThreshold: RiskLevel;
  /** Enable dual-house voting integration */
  enableDualHouse: boolean;
  /** Enable model router integration */
  enableModelRouter: boolean;
}

interface LocalIssue {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  detected_at: string;
  signal_ids: string;
  evidence: string;
  suggested_actions: string;
}

interface BridgeEvents {
  'bridge:pipeline_started': { issueId: string; pipelineId: string };
  'bridge:pipeline_completed': { issueId: string; result: PipelineResult };
  'bridge:document_created': { documentId: string; type: DocumentType };
  'bridge:voting_created': { votingId: string; proposalId: string };
  'bridge:approval_required': { approvalId: string; riskLevel: RiskLevel };
  'bridge:action_locked': { actionId: string; reason: string };
  'bridge:action_unlocked': { actionId: string };
  'bridge:session_escalated': { sessionId: string; escalationType: EscalationType; reason: string };
}

// Escalation types for low-consensus sessions
export type EscalationType = 'extended_discussion' | 'working_group' | 'human_review';

export interface EscalatedSession {
  id: string;
  sessionId: string;
  issueId: string | null;
  escalationType: EscalationType;
  consensusScore: number;
  totalRounds: number;
  reason: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  assignedTo: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

type BridgeEventHandler<K extends keyof BridgeEvents> = (
  data: BridgeEvents[K]
) => void;

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  autoPipelineOnIssue: false,
  autoPipelineRiskThreshold: 'LOW',
  enableDualHouse: true,
  enableModelRouter: true,
};

// ============================================
// Governance OS Bridge Service
// ============================================

/**
 * Bridge service connecting existing apps/api services
 * to the new v2.0 Governance OS packages.
 */
export class GovernanceOSBridge extends EventEmitter {
  private db: Database.Database;
  private io: SocketServer;
  private config: BridgeConfig;
  private governanceOS: GovernanceOS;
  private storage: GovernanceStorage;
  private pipelinesByIssue: Map<string, string[]> = new Map();
  private eventHandlers: Map<keyof BridgeEvents, Set<BridgeEventHandler<keyof BridgeEvents>>> = new Map();

  constructor(
    db: Database.Database,
    io: SocketServer,
    config?: Partial<BridgeConfig>
  ) {
    super();
    this.db = db;
    this.io = io;
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };

    // Initialize SQLite-backed storage for v2.0 packages
    this.storage = new GovernanceStorage(db);

    // Initialize GovernanceOS
    this.governanceOS = createGovernanceOS();

    // Wire up events
    this.wireEvents();

    // Set up bidirectional feedback listeners
    this.setupFeedbackListeners();

    // Set up storage sync listeners
    this.setupStorageSync();

    console.log('[GovernanceOSBridge] Service initialized with SQLite storage');
  }

  // ==========================================
  // Storage Access
  // ==========================================

  /** Get the SQLite storage service for v2.0 persistence */
  getStorage(): GovernanceStorage {
    return this.storage;
  }

  // ==========================================
  // Event Wiring
  // ==========================================

  private wireEvents(): void {
    // Forward GovernanceOS events to Socket.IO
    this.governanceOS.on('pipeline:completed', (data) => {
      this.io.emit('governance-os:pipeline:completed', data);
      this.emitBridgeEvent('bridge:pipeline_completed', {
        issueId: data.result.context.issueId || '',
        result: data.result,
      });
    });

    this.governanceOS.on('pipeline:stage_completed', (data) => {
      this.io.emit('governance-os:pipeline:stage', data);
    });

    this.governanceOS.on('execution:locked', (data) => {
      this.io.emit('governance-os:action:locked', data);
      this.emitBridgeEvent('bridge:action_locked', {
        actionId: data.actionId,
        reason: data.reason,
      });
    });

    this.governanceOS.on('execution:unlocked', (data) => {
      this.io.emit('governance-os:action:unlocked', data);
      this.emitBridgeEvent('bridge:action_unlocked', {
        actionId: data.actionId,
      });
    });

    this.governanceOS.on('approval:received', (data) => {
      this.io.emit('governance-os:approval:received', data);
    });

    this.governanceOS.on('system:health_check', (data) => {
      this.io.emit('governance-os:health', data);
    });

    // Listen for Agora session completion events
    this.io.on('connection', (_socket) => {
      // Note: The actual Agora session handling is done in AgoraService.integrateWithGovernanceOS()
      // This listener can be used for additional coordination if needed
    });
  }

  /**
   * Set up listeners to sync GovernanceOS events to SQLite storage
   */
  private setupStorageSync(): void {
    // Track pipeline start time for execution time calculation
    const pipelineStartTimes = new Map<string, number>();

    // Track pipeline start
    this.governanceOS.on('pipeline:started', (data) => {
      pipelineStartTimes.set(data.context.id, Date.now());
    });

    // Sync pipeline runs to SQLite
    this.governanceOS.on('pipeline:completed', (data) => {
      try {
        // Record pipeline completion in storage
        const existingRuns = this.storage.pipeline.getByIssueId(data.result.context.issueId || '');
        const runId = existingRuns.length > 0 ? existingRuns[0].id : null;

        if (runId) {
          this.storage.pipeline.updateRun(runId, {
            status: data.result.success ? 'completed' : 'failed',
            result: JSON.stringify(data.result),
            completed_at: new Date().toISOString(),
          });
        }

        // Calculate execution time
        const startTime = pipelineStartTimes.get(data.result.context.id);
        const executionTimeMs = startTime ? Date.now() - startTime : 0;
        pipelineStartTimes.delete(data.result.context.id);

        // Record KPI sample for pipeline completion time
        if (executionTimeMs > 0) {
          this.storage.kpi.recordSample({
            metric_name: 'pipeline_completion_time_ms',
            value: executionTimeMs,
            target: 300000, // 5 minute target
            unit: 'ms',
            category: 'pipeline',
            tags: JSON.stringify({ workflowType: data.result.context.workflowType }),
          });
        }

        // Record pipeline success/failure KPI
        this.storage.kpi.recordSample({
          metric_name: 'pipeline_success',
          value: data.result.success ? 1 : 0,
          target: 1,
          unit: 'boolean',
          category: 'pipeline',
          tags: JSON.stringify({ status: data.result.status }),
        });

        console.log('[StorageSync] Synced pipeline completion to SQLite');
      } catch (error) {
        console.error('[StorageSync] Failed to sync pipeline completion:', error);
      }
    });

    // Sync locked actions to SQLite
    this.governanceOS.on('execution:locked', (data) => {
      try {
        this.storage.locks.createLock({
          action_type: 'governance_action',
          action_data: JSON.stringify(data),
          risk_level: 'HIGH', // Locked actions are typically HIGH risk
          status: 'locked',
          required_approvals: JSON.stringify(['director3']),
          reason: data.reason,
          created_by: 'governance-os',
          timeout_at: null,
        });
        console.log('[StorageSync] Synced locked action to SQLite');
      } catch (error) {
        console.error('[StorageSync] Failed to sync locked action:', error);
      }
    });

    // Sync approvals to SQLite
    this.governanceOS.on('approval:received', (data) => {
      try {
        // Find the corresponding lock
        const pendingLocks = this.storage.locks.getPendingLocks();
        const lock = pendingLocks.find(l =>
          (JSON.parse(l.action_data) as { actionId?: string }).actionId === data.actionId);

        if (lock) {
          this.storage.locks.addApproval({
            lock_id: lock.id,
            reviewer_id: data.approver,
            reviewer_type: 'human',
            action: 'approve',
            comments: null,
          });
        }
        console.log('[StorageSync] Synced approval to SQLite');
      } catch (error) {
        console.error('[StorageSync] Failed to sync approval:', error);
      }
    });

    // Sync unlocked actions to SQLite
    this.governanceOS.on('execution:unlocked', (data) => {
      try {
        const pendingLocks = this.storage.locks.getPendingLocks();
        const lock = pendingLocks.find(l =>
          (JSON.parse(l.action_data) as { actionId?: string }).actionId === data.actionId);

        if (lock) {
          this.storage.locks.updateLock(lock.id, {
            status: 'unlocked',
            unlocked_at: new Date().toISOString(),
          });
        }
        console.log('[StorageSync] Synced unlocked action to SQLite');
      } catch (error) {
        console.error('[StorageSync] Failed to sync unlocked action:', error);
      }
    });
  }

  /**
   * Handle Agora session completion event.
   * Called by AgoraService when a session completes.
   *
   * This method will:
   * 1. Update issue status based on consensus
   * 2. Create PP document for strong consensus cases
   * 3. AUTO-CREATE PROPOSAL in proposals table for high-priority issues with strong consensus
   */
  async handleAgoraSessionCompleted(sessionData: {
    sessionId: string;
    title: string;
    issueId?: string;
    decisionPacketId?: string;
    consensusScore: number;
    recommendation: string;
    totalRounds?: number;
  }): Promise<void> {
    console.log(`[GovernanceOSBridge] Handling Agora session completion: ${sessionData.sessionId.slice(0, 8)}`);

    // If this session was for a specific issue, update the issue status
    if (sessionData.issueId) {
      const hasStrongConsensus = sessionData.consensusScore >= 0.7;
      const hasMinimumRounds = (sessionData.totalRounds || 0) >= 3;

      // Update issue status based on consensus
      const newStatus = hasStrongConsensus ? 'in_progress' : 'confirmed';
      this.db.prepare(`
        UPDATE issues
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStatus, sessionData.issueId);

      console.log(`[GovernanceOSBridge] Updated issue ${sessionData.issueId.slice(0, 8)} status to ${newStatus}`);

      // Create Decision Packet (DP) document for all completed sessions with issue
      if (sessionData.decisionPacketId || hasMinimumRounds) {
        try {
          const docRegistry = this.governanceOS.getDocumentRegistry();
          await docRegistry.documents.create({
            type: 'DP', // Decision Packet
            title: `Decision Packet: ${sessionData.title}`,
            summary: `Agora session completed with ${(sessionData.consensusScore * 100).toFixed(0)}% consensus after ${sessionData.totalRounds || 0} rounds.`,
            content: JSON.stringify({
              sourceType: 'agora_session',
              sourceId: sessionData.sessionId,
              issueId: sessionData.issueId,
              decisionPacketId: sessionData.decisionPacketId,
              consensusScore: sessionData.consensusScore,
              totalRounds: sessionData.totalRounds,
              recommendation: sessionData.recommendation,
            }),
            createdBy: 'governance-os-bridge',
          });
          console.log(`[GovernanceOSBridge] Created DP document for session ${sessionData.sessionId.slice(0, 8)}`);
        } catch (error) {
          console.error('[GovernanceOSBridge] Failed to create DP document:', error);
        }
      }

      // If strong consensus, create a proposal document (PP)
      if (hasStrongConsensus && sessionData.decisionPacketId) {
        try {
          const docRegistry = this.governanceOS.getDocumentRegistry();
          const proposalDoc = await docRegistry.documents.create({
            type: 'PP', // Proposal Package
            title: `Proposal: ${sessionData.title}`,
            summary: sessionData.recommendation,
            content: JSON.stringify({
              sourceType: 'agora_session',
              sourceId: sessionData.sessionId,
              decisionPacketId: sessionData.decisionPacketId,
              consensusScore: sessionData.consensusScore,
              recommendation: sessionData.recommendation,
            }),
            createdBy: 'governance-os-bridge',
          });

          console.log(`[GovernanceOSBridge] Created proposal document ${proposalDoc.id}`);

          this.io.emit('governance:document:created', {
            id: proposalDoc.id,
            type: 'PP',
            title: proposalDoc.title,
            state: proposalDoc.state,
            sessionId: sessionData.sessionId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('[GovernanceOSBridge] Failed to create proposal document:', error);
        }
      }

      // AUTO-CREATE PROPOSAL for high-priority issues with strong consensus and minimum rounds
      if (hasStrongConsensus && hasMinimumRounds) {
        await this.createProposalFromSession(sessionData);

        // Auto-progress the newly created proposal to voting if consensus is strong
        await this.autoProgressProposalForIssue(sessionData.issueId, sessionData.consensusScore);
      }

      // ESCALATE low-consensus sessions that have completed minimum rounds
      if (!hasStrongConsensus && hasMinimumRounds) {
        await this.escalateLowConsensusSession(sessionData);
      }
    }
  }

  /**
   * Escalate a session with low consensus for further action.
   * Routes to different escalation types based on consensus score:
   * - 50-70%: extended_discussion (add more rounds)
   * - 30-50%: working_group (create focused working group)
   * - <30%: human_review (escalate to human governance committee)
   */
  private async escalateLowConsensusSession(sessionData: {
    sessionId: string;
    title: string;
    issueId?: string;
    decisionPacketId?: string;
    consensusScore: number;
    recommendation: string;
    totalRounds?: number;
  }): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');

    // Determine escalation type based on consensus score
    let escalationType: EscalationType;
    let reason: string;

    if (sessionData.consensusScore >= 0.5) {
      // 50-70%: Some agreement but not enough for auto-proposal
      escalationType = 'extended_discussion';
      reason = `Session achieved ${(sessionData.consensusScore * 100).toFixed(0)}% consensus after ${sessionData.totalRounds} rounds. Extended discussion recommended to reach stronger agreement.`;
    } else if (sessionData.consensusScore >= 0.3) {
      // 30-50%: Significant disagreement, needs focused attention
      escalationType = 'working_group';
      reason = `Session achieved only ${(sessionData.consensusScore * 100).toFixed(0)}% consensus. Working group formation recommended to resolve fundamental disagreements.`;
    } else {
      // <30%: Major disagreement, requires human oversight
      escalationType = 'human_review';
      reason = `Session achieved only ${(sessionData.consensusScore * 100).toFixed(0)}% consensus (below minimum threshold). Human governance committee review required.`;
    }

    const escalationId = uuidv4();
    const now = new Date().toISOString();

    try {
      // Create escalation record
      this.db.prepare(`
        INSERT INTO escalated_sessions (
          id, session_id, issue_id, escalation_type, consensus_score,
          total_rounds, reason, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        escalationId,
        sessionData.sessionId,
        sessionData.issueId || null,
        escalationType,
        sessionData.consensusScore,
        sessionData.totalRounds || 0,
        reason,
        'pending',
        now,
        now
      );

      console.log(`[GovernanceOSBridge] Escalated session ${sessionData.sessionId.slice(0, 8)} to ${escalationType}`);

      // Take appropriate action based on escalation type
      await this.processEscalation(escalationId, escalationType, sessionData);

      // Log activity
      this.db.prepare(`
        INSERT INTO activity_log (id, type, severity, timestamp, message, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        'SESSION_ESCALATED',
        escalationType === 'human_review' ? 'warning' : 'info',
        now,
        `Session escalated: ${sessionData.title}`,
        JSON.stringify({
          escalationId,
          sessionId: sessionData.sessionId,
          issueId: sessionData.issueId,
          escalationType,
          consensusScore: sessionData.consensusScore,
        })
      );

      // Emit WebSocket event
      this.io.emit('governance:session:escalated', {
        escalationId,
        sessionId: sessionData.sessionId,
        issueId: sessionData.issueId,
        escalationType,
        consensusScore: sessionData.consensusScore,
        reason,
        timestamp: now,
      });

      // Emit bridge event
      this.emitBridgeEvent('bridge:session_escalated', {
        sessionId: sessionData.sessionId,
        escalationType,
        reason,
      });

    } catch (error) {
      console.error(`[GovernanceOSBridge] Failed to escalate session ${sessionData.sessionId}:`, error);
    }
  }

  /**
   * Process an escalation based on its type
   */
  private async processEscalation(
    escalationId: string,
    escalationType: EscalationType,
    sessionData: {
      sessionId: string;
      title: string;
      issueId?: string;
      recommendation: string;
      totalRounds?: number;
    }
  ): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');

    switch (escalationType) {
      case 'extended_discussion': {
        // Create a new Agora session with additional rounds
        const newMaxRounds = (sessionData.totalRounds || 5) + 3;
        const newSessionId = uuidv4();

        this.db.prepare(`
          INSERT INTO agora_sessions (
            id, issue_id, title, description, status, current_round, max_rounds, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          newSessionId,
          sessionData.issueId || null,
          `[Extended] ${sessionData.title}`,
          `Extended discussion session with Red Team participation. Previous session achieved insufficient consensus. This session has ${newMaxRounds} rounds for deeper deliberation.`,
          'pending',
          1,
          newMaxRounds
        );

        // Auto-summon Red Team agents for extended discussion
        try {
          const redTeamAgents = this.db.prepare(`
            SELECT id FROM agents
            WHERE group_name = 'red_team' AND is_active = 1
          `).all() as Array<{ id: string }>;

          for (const agent of redTeamAgents) {
            this.db.prepare(`
              UPDATE agent_states
              SET status = 'active', current_session_id = ?, last_active = CURRENT_TIMESTAMP
              WHERE agent_id = ?
            `).run(newSessionId, agent.id);
          }

          if (redTeamAgents.length > 0) {
            console.log(`[GovernanceOSBridge] Summoned ${redTeamAgents.length} Red Team agents for session ${newSessionId.slice(0, 8)}`);
          }
        } catch (error) {
          console.error('[GovernanceOSBridge] Failed to summon Red Team:', error);
        }

        // Update escalation with assignment
        this.db.prepare(`
          UPDATE escalated_sessions SET assigned_to = ?, status = 'in_progress', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newSessionId, escalationId);

        console.log(`[GovernanceOSBridge] Created extended discussion session ${newSessionId.slice(0, 8)}`);
        break;
      }

      case 'working_group': {
        // Create a working group record (using issues table with special status)
        if (sessionData.issueId) {
          this.db.prepare(`
            UPDATE issues SET
              status = 'working_group_assigned',
              suggested_actions = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            JSON.stringify({
              type: 'working_group',
              escalationId,
              originalSessionId: sessionData.sessionId,
              recommendation: sessionData.recommendation,
            }),
            sessionData.issueId
          );

          // Update escalation status
          this.db.prepare(`
            UPDATE escalated_sessions SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(escalationId);

          console.log(`[GovernanceOSBridge] Assigned issue ${sessionData.issueId.slice(0, 8)} to working group`);
        }
        break;
      }

      case 'human_review': {
        // Create a high-priority notification for human review
        const notificationId = uuidv4();

        this.db.prepare(`
          INSERT INTO activity_log (id, type, severity, timestamp, message, details)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        `).run(
          notificationId,
          'HUMAN_REVIEW_REQUIRED',
          'critical',
          `Human review required: ${sessionData.title}`,
          JSON.stringify({
            escalationId,
            sessionId: sessionData.sessionId,
            issueId: sessionData.issueId,
            action: 'Governance committee review requested due to very low agent consensus.',
          })
        );

        // If there's a linked issue, update its status
        if (sessionData.issueId) {
          this.db.prepare(`
            UPDATE issues SET status = 'pending_human_review', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sessionData.issueId);
        }

        // Update escalation status
        this.db.prepare(`
          UPDATE escalated_sessions SET status = 'pending', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(escalationId);

        console.log(`[GovernanceOSBridge] Created human review request for session ${sessionData.sessionId.slice(0, 8)}`);
        break;
      }
    }
  }

  /**
   * Get pending escalations
   */
  getPendingEscalations(): EscalatedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM escalated_sessions
      WHERE status IN ('pending', 'in_progress')
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      session_id: string;
      issue_id: string | null;
      escalation_type: string;
      consensus_score: number;
      total_rounds: number;
      reason: string;
      status: string;
      assigned_to: string | null;
      resolution: string | null;
      created_at: string;
      updated_at: string;
      resolved_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      issueId: row.issue_id,
      escalationType: row.escalation_type as EscalationType,
      consensusScore: row.consensus_score,
      totalRounds: row.total_rounds,
      reason: row.reason,
      status: row.status as 'pending' | 'in_progress' | 'resolved' | 'dismissed',
      assignedTo: row.assigned_to,
      resolution: row.resolution,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    }));
  }

  /**
   * Resolve an escalation
   */
  resolveEscalation(escalationId: string, resolution: string): boolean {
    const result = this.db.prepare(`
      UPDATE escalated_sessions
      SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resolution, escalationId);

    return result.changes > 0;
  }

  /**
   * Create a proposal in the proposals table from a completed Agora session.
   * This bridges the gap between Agora discussions and the proposal voting system.
   */
  private async createProposalFromSession(sessionData: {
    sessionId: string;
    title: string;
    issueId?: string;
    decisionPacketId?: string;
    consensusScore: number;
    recommendation: string;
  }): Promise<void> {
    if (!sessionData.issueId) {
      console.log('[GovernanceOSBridge] No issueId, skipping proposal creation');
      return;
    }

    // Get issue details
    const issue = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(sessionData.issueId) as LocalIssue | null;
    if (!issue) {
      console.log(`[GovernanceOSBridge] Issue ${sessionData.issueId} not found, skipping proposal creation`);
      return;
    }

    // Only create proposals for high/critical priority issues
    const priority = issue.priority.toLowerCase();
    if (priority !== 'high' && priority !== 'critical') {
      console.log(`[GovernanceOSBridge] Issue priority ${priority} is not high/critical, skipping proposal creation`);
      return;
    }

    // Check if proposal already exists for this issue
    const existingProposal = this.db.prepare(
      'SELECT id FROM proposals WHERE issue_id = ?'
    ).get(sessionData.issueId) as { id: string } | null;

    if (existingProposal) {
      console.log(`[GovernanceOSBridge] Proposal already exists for issue ${sessionData.issueId.slice(0, 8)}, skipping`);
      return;
    }

    // Generate proposal ID
    const { v4: uuidv4 } = await import('uuid');
    const proposalId = uuidv4();
    const now = new Date().toISOString();

    // Calculate voting period (start in 24h, vote for 72h)
    const votingStarts = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const votingEnds = new Date(Date.now() + (24 + 72) * 60 * 60 * 1000).toISOString();

    // Clean up title (remove [Auto] prefix if present)
    const cleanTitle = sessionData.title.replace(/^\[Auto\]\s*/i, '').trim();

    // Build proposal description
    const description = `## Background

${issue.description}

## Agora Discussion Summary

This proposal was auto-generated based on a completed Agora discussion session.

**Consensus Score**: ${(sessionData.consensusScore * 100).toFixed(0)}%
**Session ID**: ${sessionData.sessionId.slice(0, 8)}...

## Recommendation

${sessionData.recommendation || 'Proceed with the discussed approach.'}

## Evidence

${issue.evidence ? JSON.parse(issue.evidence).slice(0, 3).map((e: { source: string; severity: string; description: string }) => `- **[${e.severity}]** ${e.source}: ${e.description?.substring(0, 100)}`).join('\n') : 'See linked issue for details.'}
`;

    // Determine proposal type based on category
    const proposalType = this.categoryToProposalType(issue.category);

    // Create the proposal
    try {
      this.db.prepare(`
        INSERT INTO proposals (
          id, title, description, proposer, status,
          issue_id, voting_starts, voting_ends,
          proposal_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        proposalId,
        `Proposal: ${cleanTitle}`,
        description,
        'agora-orchestrator',
        'draft', // Start as draft for human review
        sessionData.issueId,
        votingStarts,
        votingEnds,
        proposalType,
        now,
        now
      );

      console.log(`[GovernanceOSBridge] Created proposal ${proposalId.slice(0, 8)} from Agora session ${sessionData.sessionId.slice(0, 8)}`);

      // Log activity
      this.db.prepare(`
        INSERT INTO activity_log (id, type, severity, timestamp, message, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        'PROPOSAL_AUTO_CREATED',
        'info',
        now,
        `Auto-created proposal: ${cleanTitle}`,
        JSON.stringify({
          proposalId,
          issueId: sessionData.issueId,
          sessionId: sessionData.sessionId,
          consensusScore: sessionData.consensusScore,
        })
      );

      // Emit WebSocket event
      this.io.emit('proposal:created', {
        proposal: {
          id: proposalId,
          title: `Proposal: ${cleanTitle}`,
          status: 'draft',
          issueId: sessionData.issueId,
          autoGenerated: true,
        },
      });

      // Also emit activity event
      this.io.emit('activity:event', {
        type: 'PROPOSAL_AUTO_CREATED',
        severity: 'info',
        message: `Auto-created proposal from Agora discussion: ${cleanTitle}`,
        timestamp: now,
      });

    } catch (error) {
      console.error(`[GovernanceOSBridge] Failed to create proposal from session:`, error);
    }
  }

  /**
   * Auto-progress a proposal from draft → pending_review → voting
   * when the Agora session has strong consensus (≥70%).
   */
  private async autoProgressProposalForIssue(issueId: string, consensusScore: number): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');

    // Find proposal for this issue
    const proposal = this.db.prepare(
      "SELECT id, status, title FROM proposals WHERE issue_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(issueId) as { id: string; status: string; title: string } | null;

    if (!proposal) return;

    // Only progress draft proposals
    if (proposal.status !== 'draft') return;

    const now = new Date().toISOString();

    try {
      // draft → pending_review
      this.db.prepare(`
        UPDATE proposals SET status = 'pending_review', updated_at = ? WHERE id = ?
      `).run(now, proposal.id);

      this.db.prepare(`
        INSERT INTO proposal_history (id, proposal_id, from_status, to_status, changed_by, reason)
        VALUES (?, ?, 'draft', 'pending_review', 'governance-os-bridge', ?)
      `).run(uuidv4(), proposal.id, `Auto-progressed: Agora consensus ${(consensusScore * 100).toFixed(0)}%`);

      // If consensus ≥ 70%, skip discussion and go directly to voting
      if (consensusScore >= 0.7) {
        // pending_review → discussion
        this.db.prepare(`
          UPDATE proposals SET status = 'discussion', updated_at = ? WHERE id = ?
        `).run(now, proposal.id);

        this.db.prepare(`
          INSERT INTO proposal_history (id, proposal_id, from_status, to_status, changed_by, reason)
          VALUES (?, ?, 'pending_review', 'discussion', 'governance-os-bridge', 'Auto-approved for discussion')
        `).run(uuidv4(), proposal.id);

        // discussion → voting
        const votingEnds = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        this.db.prepare(`
          UPDATE proposals SET status = 'voting', voting_starts = ?, voting_ends = ?, updated_at = ? WHERE id = ?
        `).run(now, votingEnds, now, proposal.id);

        this.db.prepare(`
          INSERT INTO proposal_history (id, proposal_id, from_status, to_status, changed_by, reason)
          VALUES (?, ?, 'discussion', 'voting', 'governance-os-bridge', ?)
        `).run(uuidv4(), proposal.id, `Auto-progressed to voting: consensus ${(consensusScore * 100).toFixed(0)}%`);

        console.log(`[GovernanceOSBridge] Auto-progressed proposal ${proposal.id.slice(0, 8)} to voting`);

        // Activate v2.0 governance features for this proposal
        await this.activateGovernanceForProposal(proposal.id);

        this.io.emit('proposal:voting_started', {
          proposal: { id: proposal.id, title: proposal.title, status: 'voting' },
          autoProgressed: true,
          consensusScore,
        });

        this.io.emit('activity:event', {
          type: 'PROPOSAL_AUTO_VOTING',
          severity: 'info',
          message: `Proposal auto-progressed to voting: ${proposal.title}`,
          timestamp: now,
        });
      }
    } catch (error) {
      console.error(`[GovernanceOSBridge] Failed to auto-progress proposal ${proposal.id}:`, error);
    }
  }

  /**
   * Activate v2.0 governance features for a proposal based on its risk level.
   * - HIGH/CRITICAL: Create dual-house voting session
   * - LOW: Create passive consensus (auto-approve after 48h if no objection)
   * - Also creates GP (Governance Proposal) document
   */
  async activateGovernanceForProposal(proposalId: string): Promise<void> {
    const proposal = this.db.prepare(
      'SELECT * FROM proposals WHERE id = ?'
    ).get(proposalId) as { id: string; title: string; description: string; issue_id: string | null; proposal_type: string; status: string } | null;

    if (!proposal) return;

    // Get issue to determine risk level
    let riskLevel: 'LOW' | 'MID' | 'HIGH' = 'LOW';
    if (proposal.issue_id) {
      const issue = this.db.prepare('SELECT priority, category FROM issues WHERE id = ?')
        .get(proposal.issue_id) as { priority: string; category: string } | null;
      if (issue) {
        riskLevel = this.determineRiskLevel(issue as any) as 'LOW' | 'MID' | 'HIGH';
      }
    }

    try {
      // Create GP (Governance Proposal) document
      const docRegistry = this.governanceOS.getDocumentRegistry();
      await docRegistry.documents.create({
        type: 'GP', // Governance Proposal
        title: `Governance Proposal: ${proposal.title}`,
        summary: proposal.description?.substring(0, 500) || proposal.title,
        content: JSON.stringify({
          proposalId: proposal.id,
          proposalType: proposal.proposal_type,
          issueId: proposal.issue_id,
          riskLevel,
          status: proposal.status,
        }),
        createdBy: 'governance-os-bridge',
      });
      console.log(`[GovernanceOSBridge] Created GP document for proposal ${proposalId.slice(0, 8)}`);
    } catch (error) {
      console.error('[GovernanceOSBridge] Failed to create GP document:', error);
    }

    // Activate dual-house voting for HIGH/CRITICAL risk
    if (riskLevel === 'HIGH' && this.config.enableDualHouse) {
      try {
        const voting = await this.createDualHouseVoting({
          proposalId: proposal.id,
          title: proposal.title,
          summary: proposal.description?.substring(0, 500) || proposal.title,
          riskLevel,
          category: proposal.proposal_type || 'general',
          createdBy: 'governance-os-bridge',
        });
        console.log(`[GovernanceOSBridge] Created dual-house voting ${voting.id} for proposal ${proposalId.slice(0, 8)}`);
      } catch (error) {
        console.error('[GovernanceOSBridge] Failed to create dual-house voting:', error);
      }
    }

    // Activate passive consensus for LOW risk
    if (riskLevel === 'LOW') {
      this.io.emit('governance:passive-consensus:eligible', {
        proposalId: proposal.id,
        riskLevel,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Map issue category to proposal type
   */
  private categoryToProposalType(category: string): string {
    const cat = category.toLowerCase();
    if (cat.includes('security') || cat.includes('technical') || cat.includes('protocol')) {
      return 'technical';
    }
    if (cat.includes('market') || cat.includes('defi') || cat.includes('treasury')) {
      return 'budget';
    }
    if (cat.includes('governance') || cat.includes('policy')) {
      return 'policy';
    }
    if (cat.includes('partnership') || cat.includes('ecosystem') || cat.includes('mossland')) {
      return 'partnership';
    }
    if (cat.includes('grant') || cat.includes('dev')) {
      return 'grant';
    }
    return 'general';
  }

  /**
   * Backfill missing proposals from completed Agora sessions.
   * This processes sessions that completed without auto-proposal creation.
   *
   * Criteria:
   * - Session status is 'completed'
   * - Session has an issue_id
   * - Session has at least 3 rounds (max_rounds check since all rounds completed)
   * - Issue priority is 'high' or 'critical'
   * - No existing proposal for this issue
   */
  async backfillMissingProposals(): Promise<{
    processed: number;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    console.log('[GovernanceOSBridge] Starting backfill of missing proposals...');

    const result = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      // Find completed Agora sessions that meet criteria
      const eligibleSessions = this.db.prepare(`
        SELECT
          s.id as session_id,
          s.title,
          s.description,
          s.issue_id,
          s.current_round,
          s.max_rounds,
          s.created_at,
          s.updated_at,
          i.priority,
          i.category,
          i.description as issue_description,
          i.evidence
        FROM agora_sessions s
        JOIN issues i ON s.issue_id = i.id
        WHERE s.status = 'completed'
          AND s.current_round >= 3
          AND i.priority IN ('high', 'critical')
          AND s.issue_id NOT IN (
            SELECT issue_id FROM proposals WHERE issue_id IS NOT NULL
          )
        ORDER BY s.updated_at DESC
        LIMIT 50
      `).all() as Array<{
        session_id: string;
        title: string;
        description: string;
        issue_id: string;
        current_round: number;
        max_rounds: number;
        created_at: string;
        updated_at: string;
        priority: string;
        category: string;
        issue_description: string;
        evidence: string;
      }>;

      console.log(`[GovernanceOSBridge] Found ${eligibleSessions.length} eligible sessions for backfill`);

      for (const session of eligibleSessions) {
        result.processed++;

        try {
          // Get decision packet for this session (if any)
          const decisionPacket = this.db.prepare(`
            SELECT id, recommendation, confidence
            FROM agora_decision_packets
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT 1
          `).get(session.session_id) as {
            id: string;
            recommendation: string;
            confidence: number;
          } | null;

          // Calculate effective consensus score (use decision packet confidence if available)
          const consensusScore = decisionPacket?.confidence || 0.75; // Default to 75% if no packet

          // Create the proposal
          await this.createProposalFromSession({
            sessionId: session.session_id,
            title: session.title,
            issueId: session.issue_id,
            decisionPacketId: decisionPacket?.id,
            consensusScore,
            recommendation: decisionPacket?.recommendation || 'Proceed based on Agora discussion outcomes.',
          });

          result.created++;
          console.log(`[GovernanceOSBridge] Backfilled proposal for session ${session.session_id.slice(0, 8)}`);

        } catch (error) {
          const errorMsg = `Session ${session.session_id.slice(0, 8)}: ${String(error)}`;
          result.errors.push(errorMsg);
          result.skipped++;
          console.error(`[GovernanceOSBridge] Failed to backfill session ${session.session_id.slice(0, 8)}:`, error);
        }
      }

      console.log(`[GovernanceOSBridge] Backfill complete: ${result.created} created, ${result.skipped} skipped`);

      // Emit summary event
      this.io.emit('governance:backfill:completed', {
        processed: result.processed,
        created: result.created,
        skipped: result.skipped,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('[GovernanceOSBridge] Backfill failed:', error);
      result.errors.push(`Global error: ${String(error)}`);
    }

    return result;
  }

  private emitBridgeEvent<K extends keyof BridgeEvents>(
    event: K,
    data: BridgeEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
    this.emit(event, data);
  }

  // ==========================================
  // Public API: Pipeline Execution
  // ==========================================

  /**
   * Run a governance pipeline for a local issue.
   */
  async runPipelineForIssue(
    issueId: string,
    options?: {
      workflowType?: WorkflowType;
      riskLevel?: RiskLevel;
    }
  ): Promise<PipelineResult> {
    // Get issue from database
    const issue = this.db.prepare(
      'SELECT * FROM issues WHERE id = ?'
    ).get(issueId) as LocalIssue | null;

    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    // Determine workflow type based on issue category
    const workflowType = options?.workflowType || this.determineWorkflowType(issue);

    // Determine risk level based on priority
    const riskLevel = options?.riskLevel || this.determineRiskLevel(issue);

    // Emit pipeline started event
    const pipelineId = `pipe-${Date.now()}-${issueId.slice(0, 8)}`;
    this.emitBridgeEvent('bridge:pipeline_started', { issueId, pipelineId });
    this.io.emit('governance-os:pipeline:started', { issueId, pipelineId });

    // Record pipeline run in SQLite storage
    this.storage.pipeline.createRun({
      issue_id: issueId,
      workflow_type: workflowType,
      current_stage: 'signal_intake',
      context: JSON.stringify({
        pipelineId,
        riskLevel,
        category: issue.category,
        priority: issue.priority,
      }),
    });

    // Run the pipeline
    const result = await this.governanceOS.runPipeline({
      issueId,
      workflowType,
      riskLevel,
      metadata: {
        localIssue: issue,
        category: issue.category,
        priority: issue.priority,
      },
    });

    // Track pipeline for this issue
    const existing = this.pipelinesByIssue.get(issueId) || [];
    existing.push(result.context.id);
    this.pipelinesByIssue.set(issueId, existing);

    // Update issue in database if pipeline succeeded
    if (result.success) {
      this.db.prepare(`
        UPDATE issues
        SET status = 'in_progress',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(issueId);
    }

    return result;
  }

  /**
   * Convert local issue to Orchestrator issue format.
   */
  convertToOrchestratorIssue(localIssue: LocalIssue): OrchestratorIssue {
    return {
      id: localIssue.id,
      title: localIssue.title,
      description: localIssue.description,
      category: this.mapCategoryToTopicCategory(localIssue.category),
      source: 'issue_detection',
      signalIds: JSON.parse(localIssue.signal_ids || '[]'),
      createdAt: new Date(localIssue.detected_at),
      updatedAt: new Date(),
    };
  }

  // ==========================================
  // Public API: Document Registry
  // ==========================================

  /**
   * Create an official document from existing proposal/decision packet.
   */
  async createDocumentFromProposal(
    proposalId: string,
    documentType: DocumentType
  ): Promise<Document | null> {
    const proposal = this.db.prepare(
      'SELECT * FROM proposals WHERE id = ?'
    ).get(proposalId) as Record<string, unknown> | null;

    if (!proposal) {
      return null;
    }

    const docRegistry = this.governanceOS.getDocumentRegistry();

    const doc = await docRegistry.documents.create({
      type: documentType,
      title: proposal.title as string,
      summary: ((proposal.description as string)?.substring(0, 500) || proposal.title) as string,
      content: JSON.stringify({
        proposalId: proposal.id,
        title: proposal.title,
        description: proposal.description,
        status: proposal.status,
        createdAt: proposal.created_at,
      }),
      createdBy: (proposal.proposer as string) || 'governance-bridge',
    });

    this.emitBridgeEvent('bridge:document_created', {
      documentId: doc.id,
      type: documentType,
    });

    return doc;
  }

  /**
   * Get document by ID.
   */
  async getDocument(documentId: string): Promise<Document | null> {
    const docRegistry = this.governanceOS.getDocumentRegistry();
    return docRegistry.documents.get(documentId);
  }

  /**
   * List documents by type using query.
   */
  async listDocumentsByType(type: DocumentType): Promise<Document[]> {
    const docRegistry = this.governanceOS.getDocumentRegistry();
    const result = await docRegistry.documents.query({ type });
    return result.documents;
  }

  /**
   * List all documents with optional filters.
   */
  async listAllDocuments(options?: {
    type?: DocumentType;
    state?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ documents: Document[]; total: number }> {
    const docRegistry = this.governanceOS.getDocumentRegistry();
    const result = await docRegistry.documents.query({
      type: options?.type,
      state: options?.state as 'draft' | 'pending_review' | 'in_review' | 'approved' | 'published' | 'superseded' | 'archived' | 'rejected' | undefined,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });
    return { documents: result.documents, total: result.total };
  }

  // ==========================================
  // Public API: Dual-House Voting
  // ==========================================

  /**
   * Create a dual-house voting session for a proposal.
   */
  async createDualHouseVoting(params: {
    proposalId: string;
    title: string;
    summary: string;
    riskLevel: RiskLevel;
    category: string;
    createdBy: string;
  }): Promise<DualHouseVoting> {
    if (!this.config.enableDualHouse) {
      throw new Error('Dual-house voting is disabled');
    }

    const dualHouse = this.governanceOS.getDualHouse();
    const voting = await dualHouse.voting.createVoting({
      proposalId: params.proposalId,
      title: params.title,
      summary: params.summary,
      riskLevel: params.riskLevel,
      category: params.category,
      createdBy: params.createdBy,
    });

    this.emitBridgeEvent('bridge:voting_created', {
      votingId: voting.id,
      proposalId: params.proposalId,
    });

    this.io.emit('governance-os:voting:created', {
      voting: {
        id: voting.id,
        proposalId: params.proposalId,
        status: voting.status,
      },
    });

    return voting;
  }

  /**
   * Get voting status for a proposal.
   */
  async getVoting(votingId: string): Promise<DualHouseVoting | null> {
    const dualHouse = this.governanceOS.getDualHouse();
    return dualHouse.voting.getVoting(votingId);
  }

  /**
   * List all voting sessions with optional filters.
   */
  async listAllVotings(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: DualHouseVoting[]; total: number }> {
    const dualHouse = this.governanceOS.getDualHouse();
    const sessions = await dualHouse.voting.listVotings({
      status: options?.status as 'pending' | 'voting' | 'both_passed' | 'moc_only' | 'oss_only' | 'reconciliation' | 'executed' | 'rejected' | undefined,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });
    // Count total (without limit/offset)
    const allSessions = await dualHouse.voting.listVotings({
      status: options?.status as 'pending' | 'voting' | 'both_passed' | 'moc_only' | 'oss_only' | 'reconciliation' | 'executed' | 'rejected' | undefined,
    });
    return { sessions, total: allSessions.length };
  }

  /**
   * Cast a vote in dual-house voting.
   */
  async castVote(params: {
    votingId: string;
    house: 'mosscoin' | 'opensource';
    voterId: string;
    vote: 'for' | 'against' | 'abstain';
    weight: number;
  }): Promise<void> {
    const dualHouse = this.governanceOS.getDualHouse();

    // Map vote string to VoteChoice
    const choice: VoteChoice = params.vote;
    const house: HouseType = params.house;

    await dualHouse.voting.castVote({
      votingId: params.votingId,
      house,
      memberId: params.voterId,
      choice,
    });

    this.io.emit('governance-os:voting:vote_cast', {
      votingId: params.votingId,
      house: params.house,
      voterId: params.voterId,
    });
  }

  // ==========================================
  // Public API: High-Risk Approvals
  // ==========================================

  /**
   * Create a high-risk approval request.
   */
  async createHighRiskApproval(params: {
    proposalId: string;
    votingId: string;
    actionDescription: string;
    actionType: string;
  }): Promise<HighRiskApproval> {
    const dualHouse = this.governanceOS.getDualHouse();
    const approval = await dualHouse.highRisk.createApproval({
      proposalId: params.proposalId,
      votingId: params.votingId,
      actionDescription: params.actionDescription,
      actionType: params.actionType,
    });

    this.emitBridgeEvent('bridge:approval_required', {
      approvalId: approval.id,
      riskLevel: 'HIGH',
    });

    this.io.emit('governance-os:approval:required', {
      approval: {
        id: approval.id,
        proposalId: params.proposalId,
        lockStatus: approval.lockStatus,
      },
    });

    return approval;
  }

  /**
   * Approve a high-risk action (Director 3 approval).
   */
  async approveHighRisk(
    approvalId: string,
    approverId: string
  ): Promise<HighRiskApproval | null> {
    const dualHouse = this.governanceOS.getDualHouse();

    try {
      const approval = await dualHouse.highRisk.recordDirector3Approval(approvalId, approverId);

      this.io.emit('governance-os:approval:approved', {
        approvalId,
        approverId,
      });

      return approval;
    } catch {
      return null;
    }
  }

  /**
   * List all high-risk approvals (locked actions) with optional filters.
   */
  async listAllApprovals(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ actions: HighRiskApproval[]; total: number }> {
    const dualHouse = this.governanceOS.getDualHouse();
    const lockStatus = options?.status === 'locked' ? 'LOCKED' : options?.status === 'unlocked' ? 'UNLOCKED' : undefined;
    const actions = await dualHouse.highRisk.listApprovals({
      lockStatus,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });
    // Count total
    const allActions = await dualHouse.highRisk.listApprovals({ lockStatus });
    return { actions, total: allActions.length };
  }

  /**
   * Get a specific high-risk approval by ID.
   */
  async getApproval(approvalId: string): Promise<HighRiskApproval | null> {
    const dualHouse = this.governanceOS.getDualHouse();
    return dualHouse.highRisk.getApproval(approvalId);
  }

  // ==========================================
  // Public API: Model Router Integration
  // ==========================================

  /**
   * Execute a task using the model router.
   * Routes requests based on task type and complexity.
   * Falls back to existing LLM service for actual generation.
   */
  async executeWithModelRouter(params: {
    content: string;
    taskType?: TaskType;
    maxTokens?: number;
    systemPrompt?: string;
    temperature?: number;
    complexity?: 'fast' | 'balanced' | 'quality';
  }): Promise<{ content: string; model: string; tier: number }> {
    // Use the model router for task classification
    const modelRouter = this.governanceOS.getModelRouter();
    const task: Task = {
      id: `task-${Date.now()}`,
      type: params.taskType || 'chatter',
      prompt: params.content,
      maxTokens: params.maxTokens || 512,
      createdAt: new Date(),
    };

    // Classify task to determine appropriate model tier
    const classification = modelRouter.classifier.classify(task);
    const tierFromClassification = this.difficultyToTier(classification.difficulty);

    // Use the real LLM service for generation
    const response = await llmService.generate({
      prompt: params.content,
      systemPrompt: params.systemPrompt,
      maxTokens: params.maxTokens || 512,
      temperature: params.temperature,
      tier: tierFromClassification,
      complexity: params.complexity || this.difficultyToComplexity(classification.difficulty),
    });

    // Track usage statistics
    this.trackModelRouterUsage(task.type, classification.difficulty, response);

    return {
      content: response.content,
      model: response.model,
      tier: response.tier,
    };
  }

  /**
   * Convert difficulty level to LLM tier
   */
  private difficultyToTier(difficulty: DifficultyLevel): 0 | 1 | 2 {
    switch (difficulty) {
      case 'trivial':
        return 0;
      case 'simple':
      case 'moderate':
      case 'complex':
        return 1; // Route complex tasks to Tier 1 (quality model) to reduce Tier 2 costs
      case 'critical':
        return 2; // Only critical tasks (Decision Packets, deep analysis) use Tier 2
      default:
        return 1;
    }
  }

  /**
   * Convert difficulty level to model complexity
   */
  private difficultyToComplexity(difficulty: DifficultyLevel): 'fast' | 'balanced' | 'quality' {
    switch (difficulty) {
      case 'trivial':
      case 'simple':
        return 'fast';
      case 'moderate':
        return 'balanced';
      case 'complex':
      case 'critical':
        return 'quality';
      default:
        return 'balanced';
    }
  }

  /**
   * Track model router usage for analytics
   */
  private trackModelRouterUsage(
    taskType: string,
    difficulty: DifficultyLevel,
    response: { tier: number; model: string; tokensUsed?: number }
  ): void {
    // Emit usage event for monitoring
    this.io.emit('governance-os:model-router:usage', {
      taskType,
      difficulty,
      tier: response.tier,
      model: response.model,
      tokensUsed: response.tokensUsed || 0,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get model router statistics
   */
  getModelRouterStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    averageLatencyMs: number;
    tierUsage: Record<number, number>;
    modelUsage: Record<string, number>;
  } {
    const modelRouter = this.governanceOS.getModelRouter();
    const stats = modelRouter.router.getStats();
    return {
      totalRequests: stats.totalRequests,
      successfulRequests: stats.successfulRequests,
      failedRequests: stats.failedRequests,
      totalTokens: stats.totalTokens,
      totalCostUsd: stats.totalCostUsd,
      averageLatencyMs: stats.averageLatencyMs,
      tierUsage: stats.tierUsage,
      modelUsage: stats.modelUsage,
    };
  }

  // ==========================================
  // Public API: Safe Autonomy
  // ==========================================

  /**
   * Classify the risk level of an action.
   * Maps common action strings to ActionType values.
   */
  classifyRisk(actionType: string): RiskLevel {
    // Map common action strings to valid ActionType
    const actionTypeMap: Record<string, ActionType> = {
      fund_transfer: 'FUND_TRANSFER',
      contract_deploy: 'CONTRACT_DEPLOY',
      partnership_commit: 'PARTNERSHIP_COMMIT',
      external_communication: 'EXTERNAL_COMMUNICATION',
      proposal_create: 'PROPOSAL_CREATE',
      working_group_create: 'WORKING_GROUP_CREATE',
      grant_proposal: 'GRANT_PROPOSAL',
      milestone_report: 'MILESTONE_REPORT',
      document_publish: 'DOCUMENT_PUBLISH',
      research_digest: 'RESEARCH_DIGEST',
      agent_chatter: 'AGENT_CHATTER',
      signal_process: 'SIGNAL_PROCESS',
    };

    const normalized = actionType.toLowerCase().replace(/-/g, '_');
    const mappedType = actionTypeMap[normalized] || (actionType.toUpperCase() as ActionType);
    const classification = classifyAction(mappedType);
    return classification.riskLevel;
  }

  /**
   * Check if an action is locked.
   */
  async isActionLocked(actionId: string): Promise<boolean> {
    const safeAutonomy = this.governanceOS.getSafeAutonomy();
    const locked = await safeAutonomy.lockManager.get(actionId);
    return locked !== null && locked.status === 'LOCKED';
  }

  // ==========================================
  // Public API: Workflow Statuses
  // ==========================================

  /**
   * Get workflow statuses for all workflow types.
   */
  async getWorkflowStatuses(): Promise<{
    type: WorkflowType;
    name: string;
    description: string;
    activeCount: number;
    completedToday: number;
    pendingApproval: number;
  }[]> {
    const stats = this.governanceOS.getStats();
    const dualHouse = this.governanceOS.getDualHouse();

    // Get pending approvals count
    const pendingApprovals = await dualHouse.highRisk.listApprovals({ lockStatus: 'LOCKED' });

    // Workflow definitions
    const workflows: { type: WorkflowType; name: string; description: string }[] = [
      { type: 'A', name: 'Academic Activity', description: 'AI/Blockchain research' },
      { type: 'B', name: 'Free Debate', description: 'Open-ended deliberation' },
      { type: 'C', name: 'Developer Support', description: 'Grant applications' },
      { type: 'D', name: 'Ecosystem Expansion', description: 'Partnership opportunities' },
      { type: 'E', name: 'Working Groups', description: 'WG formation & management' },
    ];

    // Calculate active pipelines (total - successful - failed)
    const activePipelines = Math.max(0, stats.totalPipelines - stats.successfulPipelines - stats.failedPipelines);
    const completedPipelines = stats.successfulPipelines;

    // Calculate stats per workflow (distribute evenly)
    return workflows.map((wf) => ({
      ...wf,
      activeCount: Math.floor(activePipelines / 5),
      completedToday: Math.floor(completedPipelines / 5),
      pendingApproval: wf.type === 'C' || wf.type === 'D' ? Math.floor(pendingApprovals.length / 2) : 0,
    }));
  }

  // ==========================================
  // Public API: Statistics & Health
  // ==========================================

  /**
   * Get GovernanceOS statistics.
   */
  getStats() {
    return this.governanceOS.getStats();
  }

  /**
   * Get system health status.
   */
  async getHealth() {
    return this.governanceOS.getHealth();
  }

  /**
   * Get GovernanceOS configuration.
   */
  getOSConfig() {
    return this.governanceOS.getConfig();
  }

  /**
   * Get bridge configuration.
   */
  getBridgeConfig(): BridgeConfig {
    return { ...this.config };
  }

  /**
   * Get pipelines executed for an issue.
   */
  getPipelinesForIssue(issueId: string): string[] {
    return this.pipelinesByIssue.get(issueId) || [];
  }

  // ==========================================
  // Direct Access to Subsystems
  // ==========================================

  /**
   * Get the underlying GovernanceOS instance.
   */
  getGovernanceOS(): GovernanceOS {
    return this.governanceOS;
  }

  // ==========================================
  // Internal Helpers
  // ==========================================

  private determineWorkflowType(issue: LocalIssue): WorkflowType {
    const category = issue.category.toLowerCase();

    // Map categories to workflows
    if (category.includes('ai') || category.includes('research')) {
      return 'A'; // Academic Activity
    }
    if (category.includes('governance') || category.includes('proposal')) {
      return 'B'; // Free Debate
    }
    if (category.includes('dev') || category.includes('grant')) {
      return 'C'; // Developer Support
    }
    if (category.includes('mossland') || category.includes('expansion') || category.includes('partnership')) {
      return 'D'; // Ecosystem Expansion
    }
    if (category.includes('group') || category.includes('committee')) {
      return 'E'; // Working Groups
    }

    // Default to Free Debate
    return 'B';
  }

  private determineRiskLevel(issue: LocalIssue): RiskLevel {
    const priority = issue.priority.toLowerCase();

    if (priority === 'critical') {
      return 'HIGH';
    }
    if (priority === 'high') {
      return 'MID';
    }
    return 'LOW';
  }

  // ==========================================
  // Bidirectional Feedback Loop
  // ==========================================

  /**
   * Handle pipeline completion and update v1 issue status
   */
  async handlePipelineCompletion(
    issueId: string,
    result: { success: boolean; status: string; recommendation?: string }
  ): Promise<void> {
    const issue = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as LocalIssue | null;
    if (!issue) return;

    let newStatus: string;
    if (result.success) {
      // Pipeline completed successfully - move to appropriate status
      if (result.status === 'approved' || result.status === 'completed') {
        newStatus = 'resolved';
      } else if (result.status === 'requires_voting') {
        newStatus = 'pending_vote';
      } else {
        newStatus = 'in_progress';
      }
    } else {
      // Pipeline failed - needs review
      newStatus = 'needs_review';
    }

    // Update issue status
    this.db.prepare(`
      UPDATE issues
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, issueId);

    console.log(`[GovernanceOSBridge] Pipeline feedback: Issue ${issueId.slice(0, 8)} status updated to ${newStatus}`);

    // Emit feedback event
    this.io.emit('governance:feedback:issue_updated', {
      issueId,
      previousStatus: issue.status,
      newStatus,
      reason: 'pipeline_completion',
      pipelineResult: result.status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle voting completion and update v1 proposal status
   */
  async handleVotingCompletion(
    votingId: string,
    result: {
      mossCoinPassed: boolean;
      openSourcePassed: boolean;
      proposalId: string;
    }
  ): Promise<void> {
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(result.proposalId) as {
      id: string;
      status: string;
      title: string;
    } | null;

    if (!proposal) return;

    // Both houses must pass for approval (bicameral requirement)
    const approved = result.mossCoinPassed && result.openSourcePassed;
    const newStatus = approved ? 'approved' : 'rejected';

    // Update proposal status
    this.db.prepare(`
      UPDATE proposals
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, result.proposalId);

    console.log(`[GovernanceOSBridge] Voting feedback: Proposal ${result.proposalId.slice(0, 8)} ${approved ? 'APPROVED' : 'REJECTED'}`);

    // Emit feedback event
    this.io.emit('governance:feedback:proposal_updated', {
      proposalId: result.proposalId,
      votingId,
      previousStatus: proposal.status,
      newStatus,
      mossCoinPassed: result.mossCoinPassed,
      openSourcePassed: result.openSourcePassed,
      timestamp: new Date().toISOString(),
    });

    // If approved and linked to an issue, update issue status
    const linkedIssue = this.db.prepare(`
      SELECT issue_id FROM proposals WHERE id = ?
    `).get(result.proposalId) as { issue_id?: string } | null;

    if (linkedIssue?.issue_id && approved) {
      this.db.prepare(`
        UPDATE issues
        SET status = 'approved_for_action',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(linkedIssue.issue_id);

      this.io.emit('governance:feedback:issue_updated', {
        issueId: linkedIssue.issue_id,
        newStatus: 'approved_for_action',
        reason: 'voting_approved',
        proposalId: result.proposalId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle approval status change (for high-risk actions)
   */
  async handleApprovalStatusChange(
    approvalId: string,
    status: 'approved' | 'rejected',
    approvedBy: string
  ): Promise<void> {
    console.log(`[GovernanceOSBridge] Approval ${approvalId.slice(0, 8)} ${status} by ${approvedBy}`);

    // Emit approval feedback event
    this.io.emit('governance:feedback:approval_changed', {
      approvalId,
      status,
      approvedBy,
      timestamp: new Date().toISOString(),
    });

    // If approved, add approval to unlock the action
    if (status === 'approved') {
      try {
        const safeAutonomy = this.governanceOS.getSafeAutonomy();

        // Add approval - this will automatically unlock if all requirements are met
        const result = await safeAutonomy.lockManager.addApproval(approvalId, {
          reviewerId: approvedBy,
          reviewerType: 'human',
          action: 'approve',
          comments: `Approved by ${approvedBy}`,
          timestamp: new Date(),
        });

        if (result.canExecute) {
          this.io.emit('governance:action:unlocked', {
            actionId: approvalId,
            unlockedBy: approvedBy,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`[GovernanceOSBridge] Failed to process approval ${approvalId}:`, error);
      }
    }
  }

  /**
   * Subscribe to v2.0 events and propagate feedback
   */
  setupFeedbackListeners(): void {
    // Listen for pipeline completion from GovernanceOS
    this.governanceOS.on('pipeline:completed', async (data) => {
      // Extract issue ID from pipeline result context
      const issueId = data.result.context.issueId;
      if (issueId) {
        await this.handlePipelineCompletion(issueId, {
          success: data.result.success,
          status: data.result.status,
        });
      }
    });

    // Listen for execution unlock events
    this.governanceOS.on('execution:unlocked', async (data) => {
      this.io.emit('governance:action:unlocked', {
        actionId: data.actionId,
        timestamp: new Date().toISOString(),
      });
    });

    // Listen for approval received events
    this.governanceOS.on('approval:received', async (data) => {
      await this.handleApprovalStatusChange(data.actionId, 'approved', data.approver);
    });

    console.log('[GovernanceOSBridge] Feedback listeners set up');
  }

  private mapCategoryToTopicCategory(category: string): TopicCategory {
    const cat = category.toLowerCase();

    if (cat.includes('mossland')) {
      return 'mossland_expansion';
    }
    if (cat.includes('blockchain') || cat.includes('ai')) {
      return 'blockchain_ai_ecosystem';
    }
    if (cat.includes('governance') || cat.includes('community')) {
      return 'community_governance';
    }
    if (cat.includes('dev') || cat.includes('technical') || cat.includes('infrastructure')) {
      return 'technical_infrastructure';
    }

    return 'open_general';
  }
}

// ============================================
// Factory Function
// ============================================

export function createGovernanceOSBridge(
  db: Database.Database,
  io: SocketServer,
  config?: Partial<BridgeConfig>
): GovernanceOSBridge {
  return new GovernanceOSBridge(db, io, config);
}
