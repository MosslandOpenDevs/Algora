// ===========================================
// Governance Pipeline - End-to-End Flow
// ===========================================

import type {
  PipelineContext,
  PipelineResult,
  PipelineStage,
  GovernanceOSConfig,
} from './types.js';

import type { RiskLevel } from '@algora/safe-autonomy';
import type { Issue, WorkflowType } from '@algora/orchestrator';
import type { Document } from '@algora/document-registry';
import type { DualHouseVoting, HighRiskApproval } from '@algora/dual-house';

// ============================================
// Pipeline Manager
// ============================================

/**
 * Events emitted by the pipeline.
 */
export interface PipelineEvents {
  'pipeline:started': { context: PipelineContext };
  'pipeline:stage_entered': { context: PipelineContext; stage: PipelineStage };
  'pipeline:stage_completed': { context: PipelineContext; stage: PipelineStage };
  'pipeline:blocked': { context: PipelineContext; reason: string };
  'pipeline:completed': { result: PipelineResult };
  'pipeline:error': { context: PipelineContext; error: Error };
}

/**
 * Event handler type.
 */
type PipelineEventHandler<K extends keyof PipelineEvents> = (
  data: PipelineEvents[K]
) => void;

/**
 * Stage handler function type.
 */
export type StageHandler = (
  context: PipelineContext,
  services: PipelineServices
) => Promise<PipelineContext>;

/**
 * Services available to pipeline stages.
 */
export interface PipelineServices {
  // These will be injected by GovernanceOS
  safeAutonomy: {
    classifyRisk: (action: string) => RiskLevel;
    createLockedAction: (params: unknown) => Promise<{ id: string }>;
    checkApproval: (actionId: string) => Promise<{ approved: boolean; by?: string[] }>;
  };
  orchestrator: {
    createWorkflow: (issue: Issue, type: WorkflowType) => Promise<{ id: string }>;
    runWorkflow: (workflowId: string) => Promise<{ documents: string[] }>;
    getWorkflowState: (workflowId: string) => Promise<{ state: string }>;
  };
  documentRegistry: {
    getDocument: (id: string) => Promise<Document | null>;
    createDocument: (params: unknown) => Promise<Document>;
    publishDocument: (id: string) => Promise<void>;
  };
  modelRouter: {
    executeTask: (params: unknown) => Promise<{ content: string }>;
  };
  dualHouse: {
    createVoting: (params: unknown) => Promise<DualHouseVoting>;
    getVoting: (id: string) => Promise<DualHouseVoting | null>;
    createHighRiskApproval: (params: unknown) => Promise<HighRiskApproval>;
    getHighRiskApproval: (id: string) => Promise<HighRiskApproval | null>;
  };
}

/**
 * Pipeline configuration.
 */
export interface PipelineConfig {
  /** Enable auto-progression */
  autoProgress: boolean;
  /** Max retries per stage */
  maxRetriesPerStage: number;
  /** Stage timeout ms */
  stageTimeoutMs: number;
}

/**
 * Default pipeline configuration.
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  autoProgress: true,
  maxRetriesPerStage: 3,
  stageTimeoutMs: 300000, // 5 minutes
};

/**
 * Manages the governance pipeline execution.
 */
export class GovernancePipeline {
  private config: PipelineConfig;
  private stageHandlers: Map<PipelineStage, StageHandler> = new Map();
  private eventHandlers: Map<keyof PipelineEvents, Set<PipelineEventHandler<keyof PipelineEvents>>> = new Map();
  private activePipelines: Map<string, PipelineContext> = new Map();

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.registerDefaultHandlers();
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof PipelineEvents>(
    event: K,
    handler: PipelineEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as PipelineEventHandler<keyof PipelineEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof PipelineEvents>(
    event: K,
    handler: PipelineEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as PipelineEventHandler<keyof PipelineEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof PipelineEvents>(
    event: K,
    data: PipelineEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Stage Handler Registration
  // ==========================================

  /**
   * Register a custom stage handler.
   */
  registerStageHandler(stage: PipelineStage, handler: StageHandler): void {
    this.stageHandlers.set(stage, handler);
  }

  /**
   * Register default stage handlers.
   */
  private registerDefaultHandlers(): void {
    // Signal intake - receive and validate signals
    this.stageHandlers.set('signal_intake', async (ctx, services) => {
      ctx.stage = 'signal_intake';

      // Validate that we have either an issue ID or signals to process
      const hasSignals = ctx.metadata.signalIds && Array.isArray(ctx.metadata.signalIds) && ctx.metadata.signalIds.length > 0;
      const hasIssue = !!ctx.issueId;

      if (!hasSignals && !hasIssue) {
        // No signals and no issue - this is a direct pipeline trigger
        ctx.metadata.intakeSource = 'direct';
        ctx.metadata.intakeTimestamp = new Date().toISOString();
      } else if (hasSignals) {
        // Process signals
        ctx.metadata.intakeSource = 'signals';
        ctx.metadata.intakeTimestamp = new Date().toISOString();
        ctx.metadata.signalCount = (ctx.metadata.signalIds as string[]).length;

        // Use model router to analyze signal severity if available
        try {
          const signalSummary = await services.modelRouter.executeTask({
            content: `Analyze signals: ${JSON.stringify(ctx.metadata.signalIds)}`,
            taskType: 'summary',
            maxTokens: 100,
          });
          ctx.metadata.signalAnalysis = signalSummary.content;
        } catch {
          // Model router not available, continue without analysis
          ctx.metadata.signalAnalysis = 'Signal analysis skipped';
        }
      } else {
        // Issue-based trigger
        ctx.metadata.intakeSource = 'issue';
        ctx.metadata.intakeTimestamp = new Date().toISOString();
      }

      return ctx;
    });

    // Issue detection - create or validate issue from signals
    this.stageHandlers.set('issue_detection', async (ctx, services) => {
      ctx.stage = 'issue_detection';

      // If issue already exists, validate it
      if (ctx.issueId) {
        ctx.metadata.issueStatus = 'existing';
        ctx.metadata.issueValidated = true;
        return ctx;
      }

      // If we have signals but no issue, attempt to create one
      const signalIds = ctx.metadata.signalIds as string[] | undefined;
      if (signalIds && signalIds.length > 0) {
        try {
          // Use model router to generate issue title and description
          const issueGeneration = await services.modelRouter.executeTask({
            content: `Based on these signals, generate a concise issue title and description for governance review: ${ctx.metadata.signalAnalysis || 'Multiple signals detected'}`,
            taskType: 'generation',
            maxTokens: 200,
          });

          ctx.metadata.generatedIssue = {
            title: issueGeneration.content.split('\n')[0] || 'Signal-detected issue',
            description: issueGeneration.content,
            signalIds,
            detectedAt: new Date().toISOString(),
          };
          ctx.metadata.issueStatus = 'generated';
        } catch {
          // Fallback issue generation
          ctx.metadata.generatedIssue = {
            title: `Auto-detected issue from ${signalIds.length} signals`,
            description: `This issue was automatically generated from signal analysis.`,
            signalIds,
            detectedAt: new Date().toISOString(),
          };
          ctx.metadata.issueStatus = 'generated_fallback';
        }
      } else {
        ctx.metadata.issueStatus = 'none';
      }

      return ctx;
    });

    // Workflow dispatch - determine workflow type and start
    this.stageHandlers.set('workflow_dispatch', async (ctx, services) => {
      ctx.stage = 'workflow_dispatch';
      if (ctx.issueId && ctx.workflowType) {
        const issue: Issue = {
          id: ctx.issueId,
          title: 'Pipeline Issue',
          description: '',
          category: 'community_governance',
          source: 'pipeline',
          signalIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await services.orchestrator.createWorkflow(issue, ctx.workflowType);
        ctx.metadata.workflowId = result.id;
      }
      return ctx;
    });

    // Specialist work - run the workflow specialists
    this.stageHandlers.set('specialist_work', async (ctx, services) => {
      ctx.stage = 'specialist_work';
      const workflowId = ctx.metadata.workflowId as string;
      if (workflowId) {
        const result = await services.orchestrator.runWorkflow(workflowId);
        ctx.documents.push(...result.documents);
      }
      return ctx;
    });

    // Document production - generate official documents
    this.stageHandlers.set('document_production', async (ctx, services) => {
      ctx.stage = 'document_production';

      // Check if we have workflow results to convert to documents
      const workflowId = ctx.metadata.workflowId as string | undefined;
      const hasDocuments = ctx.documents.length > 0;

      if (!hasDocuments && ctx.issueId) {
        // Generate a Decision Packet (DP) document for this pipeline
        try {
          // Get issue details for document content
          const issueTitle = (ctx.metadata.localIssue as { title?: string })?.title || `Issue ${ctx.issueId}`;
          const issueDescription = (ctx.metadata.localIssue as { description?: string })?.description || '';

          // Generate document content using model router
          let recommendation = '';
          try {
            const analysis = await services.modelRouter.executeTask({
              content: `Analyze this governance issue and provide a recommendation:
                Title: ${issueTitle}
                Description: ${issueDescription}
                Risk Level: ${ctx.riskLevel}
                Workflow Type: ${ctx.workflowType || 'standard'}`,
              taskType: 'analysis',
              maxTokens: 300,
            });
            recommendation = analysis.content;
          } catch {
            recommendation = `Recommendation pending for issue: ${issueTitle}. Risk level: ${ctx.riskLevel}.`;
          }

          // Create the Decision Packet document
          const dpDocument = await services.documentRegistry.createDocument({
            type: 'DP', // Decision Packet
            title: `Decision Packet: ${issueTitle}`,
            summary: recommendation.substring(0, 200),
            content: JSON.stringify({
              issueId: ctx.issueId,
              issueTitle,
              issueDescription,
              workflowId,
              workflowType: ctx.workflowType,
              riskLevel: ctx.riskLevel,
              recommendation,
              pipelineId: ctx.id,
              generatedAt: new Date().toISOString(),
            }),
            createdBy: 'governance-pipeline',
          });

          ctx.documents.push(dpDocument.id);
          ctx.metadata.decisionPacketId = dpDocument.id;
          ctx.metadata.documentProduction = {
            status: 'completed',
            documentsCreated: 1,
            timestamp: new Date().toISOString(),
          };

        } catch (error) {
          ctx.metadata.documentProduction = {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          };
        }
      } else if (hasDocuments) {
        // Documents already exist from workflow specialists
        ctx.metadata.documentProduction = {
          status: 'from_workflow',
          documentsCount: ctx.documents.length,
          timestamp: new Date().toISOString(),
        };
      } else {
        // No documents needed
        ctx.metadata.documentProduction = {
          status: 'skipped',
          reason: 'No issue ID provided',
          timestamp: new Date().toISOString(),
        };
      }

      return ctx;
    });

    // Dual house review - submit for voting if needed
    this.stageHandlers.set('dual_house_review', async (ctx, services) => {
      ctx.stage = 'dual_house_review';
      if (ctx.riskLevel === 'MID' || ctx.riskLevel === 'HIGH') {
        const voting = await services.dualHouse.createVoting({
          proposalId: ctx.issueId || ctx.id,
          title: `Pipeline ${ctx.id} Review`,
          summary: `Review for pipeline with risk level ${ctx.riskLevel}`,
          riskLevel: ctx.riskLevel,
          category: ctx.workflowType || 'general',
          createdBy: 'pipeline',
        });
        ctx.votingId = voting.id;
      }
      return ctx;
    });

    // Approval routing - route to appropriate approvers
    this.stageHandlers.set('approval_routing', async (ctx, services) => {
      ctx.stage = 'approval_routing';
      if (ctx.riskLevel === 'HIGH') {
        // Create locked action for HIGH risk
        const action = await services.safeAutonomy.createLockedAction({
          actionType: 'pipeline_execution',
          description: `Execute pipeline ${ctx.id}`,
          riskLevel: ctx.riskLevel,
          payload: ctx.metadata,
        });
        ctx.lockedActionId = action.id;

        // Create high-risk approval
        if (ctx.votingId) {
          const approval = await services.dualHouse.createHighRiskApproval({
            proposalId: ctx.issueId || ctx.id,
            votingId: ctx.votingId,
            actionDescription: `Execute pipeline ${ctx.id}`,
            actionType: 'pipeline_execution',
          });
          ctx.approvalId = approval.id;
        }
      }
      return ctx;
    });

    // Execution - execute the approved action
    this.stageHandlers.set('execution', async (ctx, services) => {
      ctx.stage = 'execution';

      ctx.metadata.execution = {
        startedAt: new Date().toISOString(),
        riskLevel: ctx.riskLevel,
      };

      // Check if HIGH risk action needs approval
      if (ctx.riskLevel === 'HIGH' && ctx.lockedActionId) {
        const approval = await services.safeAutonomy.checkApproval(ctx.lockedActionId);

        if (!approval.approved) {
          // Still locked, cannot proceed
          ctx.metadata.executionBlocked = true;
          ctx.metadata.execution = {
            ...ctx.metadata.execution as Record<string, unknown>,
            status: 'blocked',
            reason: 'Awaiting HIGH-risk approval',
            lockedActionId: ctx.lockedActionId,
          };
          return ctx;
        }

        // Approved - record approvers
        ctx.metadata.execution = {
          ...ctx.metadata.execution as Record<string, unknown>,
          approvedBy: approval.by,
          approvalStatus: 'approved',
        };
      }

      // Execute based on workflow type
      const executionActions: Record<string, string> = {
        'A': 'scheduled_deliberation',
        'B': 'free_debate',
        'C': 'community_poll',
        'D': 'snap_vote',
        'E': 'emergency_protocol',
      };

      const actionType = ctx.workflowType ? executionActions[ctx.workflowType] : 'standard';

      // Record execution details
      ctx.metadata.execution = {
        ...ctx.metadata.execution as Record<string, unknown>,
        status: 'completed',
        actionType,
        completedAt: new Date().toISOString(),
        documentsPublished: ctx.documents.length,
      };

      ctx.metadata.executed = true;

      // Publish documents if any were created
      for (const docId of ctx.documents) {
        try {
          await services.documentRegistry.publishDocument(docId);
        } catch {
          // Document publish failed, continue
        }
      }

      return ctx;
    });

    // Outcome verification - verify results and record KPIs
    this.stageHandlers.set('outcome_verification', async (ctx, services) => {
      ctx.stage = 'outcome_verification';

      const verification: Record<string, unknown> = {
        startedAt: new Date().toISOString(),
        pipelineId: ctx.id,
        issueId: ctx.issueId,
        workflowType: ctx.workflowType,
        riskLevel: ctx.riskLevel,
      };

      // Verify documents were created and published
      const documentsVerified: Array<{ id: string; verified: boolean }> = [];
      for (const docId of ctx.documents) {
        try {
          const doc = await services.documentRegistry.getDocument(docId);
          documentsVerified.push({
            id: docId,
            verified: doc !== null,
          });
        } catch {
          documentsVerified.push({
            id: docId,
            verified: false,
          });
        }
      }

      verification.documentsVerified = documentsVerified;
      verification.allDocumentsValid = documentsVerified.every(d => d.verified);

      // Verify voting was completed if applicable
      if (ctx.votingId) {
        try {
          const voting = await services.dualHouse.getVoting(ctx.votingId);
          verification.votingVerified = voting !== null;
          verification.votingStatus = voting?.status;
        } catch {
          verification.votingVerified = false;
        }
      }

      // Verify approval if HIGH risk
      if (ctx.approvalId) {
        try {
          const approval = await services.dualHouse.getHighRiskApproval(ctx.approvalId);
          verification.approvalVerified = approval !== null;
          verification.approvalStatus = approval?.lockStatus;
        } catch {
          verification.approvalVerified = false;
        }
      }

      // Calculate pipeline duration
      const startedAt = ctx.startedAt.getTime();
      const completedAt = Date.now();
      verification.durationMs = completedAt - startedAt;
      verification.durationFormatted = `${Math.round((completedAt - startedAt) / 1000)}s`;

      // Final verification status
      verification.status = 'completed';
      verification.completedAt = new Date().toISOString();
      verification.success = ctx.metadata.executed === true;

      ctx.metadata.verification = verification;
      ctx.metadata.verified = true;

      return ctx;
    });
  }

  // ==========================================
  // Pipeline Execution
  // ==========================================

  /**
   * Create a new pipeline context.
   */
  createContext(params: {
    issueId?: string;
    workflowType?: 'A' | 'B' | 'C' | 'D' | 'E';
    riskLevel?: RiskLevel;
    metadata?: Record<string, unknown>;
  }): PipelineContext {
    return {
      id: `pipe-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      stage: 'signal_intake',
      issueId: params.issueId,
      workflowType: params.workflowType,
      documents: [],
      riskLevel: params.riskLevel || 'LOW',
      startedAt: new Date(),
      completedStages: [],
      metadata: params.metadata || {},
    };
  }

  /**
   * Run the pipeline.
   */
  async run(
    context: PipelineContext,
    services: PipelineServices
  ): Promise<PipelineResult> {
    this.activePipelines.set(context.id, context);
    this.emit('pipeline:started', { context });

    const stages: PipelineStage[] = [
      'signal_intake',
      'issue_detection',
      'workflow_dispatch',
      'specialist_work',
      'document_production',
      'dual_house_review',
      'approval_routing',
      'execution',
      'outcome_verification',
    ];

    let currentContext = context;

    try {
      for (const stage of stages) {
        this.emit('pipeline:stage_entered', { context: currentContext, stage });

        const handler = this.stageHandlers.get(stage);
        if (handler) {
          currentContext = await this.executeWithRetry(
            () => handler(currentContext, services),
            stage
          );
        }

        currentContext.completedStages.push(stage);
        this.emit('pipeline:stage_completed', { context: currentContext, stage });

        // Check for blocking conditions
        if (currentContext.metadata.executionBlocked) {
          this.emit('pipeline:blocked', {
            context: currentContext,
            reason: 'Awaiting approval for HIGH-risk action',
          });

          currentContext.completedAt = new Date();
          const result = this.createResult(currentContext, 'locked', services);
          this.emit('pipeline:completed', { result });
          return result;
        }
      }

      currentContext.completedAt = new Date();
      const result = await this.createResultAsync(currentContext, 'completed', services);
      this.emit('pipeline:completed', { result });
      return result;

    } catch (error) {
      currentContext.error = error instanceof Error ? error.message : String(error);
      currentContext.completedAt = new Date();
      this.emit('pipeline:error', {
        context: currentContext,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      const result = this.createResult(currentContext, 'error', services);
      return result;

    } finally {
      this.activePipelines.delete(context.id);
    }
  }

  /**
   * Execute a handler with retry.
   */
  private async executeWithRetry(
    fn: () => Promise<PipelineContext>,
    _stage: PipelineStage
  ): Promise<PipelineContext> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetriesPerStage; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Stage timeout')), this.config.stageTimeoutMs);
          }),
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError || new Error('Stage failed after retries');
  }

  /**
   * Create pipeline result.
   */
  private async createResultAsync(
    context: PipelineContext,
    status: 'completed' | 'pending_approval' | 'locked' | 'rejected' | 'error',
    services: PipelineServices
  ): Promise<PipelineResult> {
    // Fetch actual documents
    const documents: Document[] = [];
    for (const docId of context.documents) {
      try {
        const doc = await services.documentRegistry.getDocument(docId);
        if (doc) {
          documents.push(doc);
        }
      } catch {
        // Document not found, continue
      }
    }

    // Fetch voting result if applicable
    let votingResult: DualHouseVoting | undefined;
    if (context.votingId) {
      try {
        const voting = await services.dualHouse.getVoting(context.votingId);
        if (voting) {
          votingResult = voting;
        }
      } catch {
        // Voting not found
      }
    }

    // Fetch approval status if applicable
    let approvalStatus: HighRiskApproval | undefined;
    if (context.approvalId) {
      try {
        const approval = await services.dualHouse.getHighRiskApproval(context.approvalId);
        if (approval) {
          approvalStatus = approval;
        }
      } catch {
        // Approval not found
      }
    }

    return {
      context,
      success: status === 'completed',
      status,
      documents,
      votingResult,
      approvalStatus,
      executionResult: context.metadata.executed ? {
        executed: true,
        executionDetails: context.metadata.execution,
        verificationDetails: context.metadata.verification,
      } : undefined,
    };
  }

  /**
   * Create pipeline result (sync version for error cases).
   */
  private createResult(
    context: PipelineContext,
    status: 'completed' | 'pending_approval' | 'locked' | 'rejected' | 'error',
    _services: PipelineServices
  ): PipelineResult {
    return {
      context,
      success: status === 'completed',
      status,
      documents: [],
      votingResult: undefined,
      approvalStatus: undefined,
      executionResult: context.metadata.executed ? {
        executed: true,
        executionDetails: context.metadata.execution,
        verificationDetails: context.metadata.verification,
      } : undefined,
    };
  }

  /**
   * Resume a blocked pipeline.
   */
  async resume(
    contextId: string,
    services: PipelineServices
  ): Promise<PipelineResult | null> {
    // In real implementation, would load from storage
    const context = this.activePipelines.get(contextId);
    if (!context) {
      return null;
    }

    // Clear blocked status
    context.metadata.executionBlocked = false;

    // Continue from execution stage
    return this.run(context, services);
  }

  /**
   * Get active pipeline count.
   */
  getActivePipelineCount(): number {
    return this.activePipelines.size;
  }

  /**
   * Get active pipeline IDs.
   */
  getActivePipelineIds(): string[] {
    return Array.from(this.activePipelines.keys());
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a governance pipeline.
 */
export function createPipeline(config?: Partial<PipelineConfig>): GovernancePipeline {
  return new GovernancePipeline(config);
}
