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
    this.stageHandlers.set('signal_intake', async (ctx, _services) => {
      ctx.stage = 'signal_intake';
      // Default: just pass through
      return ctx;
    });

    // Issue detection - create issue from signals
    this.stageHandlers.set('issue_detection', async (ctx, _services) => {
      ctx.stage = 'issue_detection';
      // Default: issue should already be created
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
    this.stageHandlers.set('document_production', async (ctx, _services) => {
      ctx.stage = 'document_production';
      // Documents are produced by specialists
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
      if (ctx.riskLevel === 'HIGH' && ctx.lockedActionId) {
        // Check if unlocked
        const approval = await services.safeAutonomy.checkApproval(ctx.lockedActionId);
        if (!approval.approved) {
          // Still locked, cannot proceed
          ctx.metadata.executionBlocked = true;
          return ctx;
        }
      }
      // Execute - in real implementation, this would trigger actual effects
      ctx.metadata.executed = true;
      return ctx;
    });

    // Outcome verification - verify results
    this.stageHandlers.set('outcome_verification', async (ctx, _services) => {
      ctx.stage = 'outcome_verification';
      // Verify execution results
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
      const result = this.createResult(currentContext, 'completed', services);
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
  private createResult(
    context: PipelineContext,
    status: 'completed' | 'pending_approval' | 'locked' | 'rejected' | 'error',
    _services: PipelineServices
  ): PipelineResult {
    return {
      context,
      success: status === 'completed',
      status,
      documents: [], // Would fetch actual documents
      votingResult: undefined, // Would fetch voting
      approvalStatus: undefined, // Would fetch approval
      executionResult: context.metadata.executed ? context.metadata : undefined,
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
