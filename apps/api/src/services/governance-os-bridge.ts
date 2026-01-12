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
import type { Task, TaskType } from '@algora/model-router';

// Import existing services for integration
import { llmService } from './llm';

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

    // Initialize GovernanceOS
    this.governanceOS = createGovernanceOS();

    // Wire up events
    this.wireEvents();

    console.log('[GovernanceOSBridge] Service initialized');
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

  // ==========================================
  // Public API: Model Router Integration
  // ==========================================

  /**
   * Execute a task using the model router.
   * Falls back to existing LLM service if model router is disabled.
   */
  async executeWithModelRouter(params: {
    content: string;
    taskType?: TaskType;
    maxTokens?: number;
  }): Promise<{ content: string; model: string; tier: number }> {
    if (!this.config.enableModelRouter) {
      // Fallback to existing LLM service
      const response = await llmService.generate({
        prompt: params.content,
        maxTokens: params.maxTokens || 512,
      });

      return {
        content: response.content,
        model: response.model,
        tier: response.tier,
      };
    }

    const modelRouter = this.governanceOS.getModelRouter();

    const task: Task = {
      id: `task-${Date.now()}`,
      type: params.taskType || 'chatter',
      prompt: params.content,
      maxTokens: params.maxTokens || 512,
      createdAt: new Date(),
    };

    const result = await modelRouter.router.execute(task);

    return {
      content: result.content,
      model: result.model,
      tier: result.usage?.totalTokens ? (result.costUsd > 0 ? 2 : 1) : 0,
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
