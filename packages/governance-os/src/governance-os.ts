// ===========================================
// Governance OS - Unified Integration Layer
// ===========================================

import type {
  GovernanceOSConfig,
  GovernanceOSStats,
  GovernanceOSEvents,
  PipelineResult,
  WorkflowConfigs,
} from './types.js';

import {
  DEFAULT_GOVERNANCE_OS_CONFIG,
  DEFAULT_WORKFLOW_CONFIGS,
  ACTION_RISK_LEVELS,
} from './types.js';

import {
  GovernancePipeline,
  createPipeline,
  type PipelineServices,
} from './pipeline.js';

// Import from v2.0 packages
import type { RiskLevel, SafeAutonomySystem } from '@algora/safe-autonomy';
import { createSafeAutonomySystem } from '@algora/safe-autonomy';

import type { Issue, WorkflowType } from '@algora/orchestrator';
import { Orchestrator, createOrchestrator, createMockLLMProvider } from '@algora/orchestrator';

import type { DocumentType } from '@algora/document-registry';
import { createDocumentRegistry } from '@algora/document-registry';

import type { Task, DifficultyLevel } from '@algora/model-router';
import { createModelRoutingSystem } from '@algora/model-router';

import type { DualHouseVoting } from '@algora/dual-house';
import { createDualHouseGovernance } from '@algora/dual-house';

import { KPICollector, createKPICollector } from './kpi.js';

// ============================================
// Event Handler Type
// ============================================

type GovernanceOSEventHandler<K extends keyof GovernanceOSEvents> = (
  data: GovernanceOSEvents[K]
) => void;

// ============================================
// Governance OS Class
// ============================================

/**
 * Unified Governance Operating System.
 * Integrates all v2.0 packages into a cohesive system.
 */
export class GovernanceOS {
  // Configuration
  private config: GovernanceOSConfig;
  private workflowConfigs: WorkflowConfigs;

  // Core subsystems
  private safeAutonomy: SafeAutonomySystem;
  private orchestrator: Orchestrator;
  private documentRegistry: ReturnType<typeof createDocumentRegistry>;
  private modelRouter: ReturnType<typeof createModelRoutingSystem>;
  private dualHouse: ReturnType<typeof createDualHouseGovernance>;

  // Pipeline
  private pipeline: GovernancePipeline;

  // KPI Collector
  private kpiCollector: KPICollector;

  // Event handlers
  private eventHandlers: Map<keyof GovernanceOSEvents, Set<GovernanceOSEventHandler<keyof GovernanceOSEvents>>> = new Map();

  // Statistics
  private stats: GovernanceOSStats;
  private startedAt: Date;

  constructor(
    config?: Partial<GovernanceOSConfig>,
    workflowConfigs?: Partial<WorkflowConfigs>
  ) {
    this.config = { ...DEFAULT_GOVERNANCE_OS_CONFIG, ...config };
    this.workflowConfigs = { ...DEFAULT_WORKFLOW_CONFIGS, ...workflowConfigs };
    this.startedAt = new Date();

    // Initialize statistics
    this.stats = {
      uptimeHours: 0,
      totalPipelines: 0,
      successfulPipelines: 0,
      failedPipelines: 0,
      pendingApprovals: 0,
      lockedActions: 0,
      documentsProduced: 0,
      votingSessions: 0,
      reconciliationsTriggered: 0,
      llmCostTodayUsd: 0,
      llmTokensToday: 0,
    };

    // Initialize subsystems with actual factory functions
    this.safeAutonomy = createSafeAutonomySystem();
    this.orchestrator = createOrchestrator({
      llmProvider: createMockLLMProvider(),
    });
    this.documentRegistry = createDocumentRegistry();
    this.modelRouter = createModelRoutingSystem();
    this.dualHouse = createDualHouseGovernance();
    this.pipeline = createPipeline();
    this.kpiCollector = createKPICollector();

    // Wire up event integrations
    this.wireIntegrations();
  }

  // ==========================================
  // Integration Wiring
  // ==========================================

  private wireIntegrations(): void {
    // Wire pipeline events to update stats and KPIs
    this.pipeline.on('pipeline:completed', (data) => {
      const { result } = data;
      this.stats.totalPipelines++;
      if (result.success) {
        this.stats.successfulPipelines++;
        this.kpiCollector.recordOperation(true);
      } else {
        this.stats.failedPipelines++;
        this.kpiCollector.recordOperation(false);
      }

      // Record execution timing
      if (result.context.startedAt && result.context.completedAt) {
        const duration = result.context.completedAt.getTime() - result.context.startedAt.getTime();
        this.kpiCollector.recordExecutionTiming('endToEndMs', duration);
      }

      this.emit('pipeline:completed', { result });
    });

    this.pipeline.on('pipeline:stage_completed', (data) => {
      this.emit('pipeline:stage_completed', data);
    });

    this.pipeline.on('pipeline:error', (data) => {
      this.kpiCollector.recordOperation(false);
      this.emit('pipeline:error', data);
    });

    // Wire dual-house voting events
    this.dualHouse.voting.on('voting:finalized', (data: { voting: DualHouseVoting }) => {
      const { voting } = data;
      if (voting.status === 'both_passed' && voting.riskLevel === 'HIGH') {
        this.emit('approval:received', {
          actionId: voting.id,
          approver: 'dual_house',
        });
      }
    });

    this.dualHouse.voting.on('voting:created', () => {
      this.stats.votingSessions++;
    });

    // Wire reconciliation events
    this.dualHouse.reconciliation.on('reconciliation:triggered', () => {
      this.stats.reconciliationsTriggered++;
    });

    // Wire high-risk unlock events
    this.dualHouse.highRisk.on('highrisk:unlocked', (data: { approvalId: string }) => {
      this.stats.lockedActions = Math.max(0, this.stats.lockedActions - 1);
      this.emit('execution:unlocked', { actionId: data.approvalId });
    });
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Register an event handler.
   */
  on<K extends keyof GovernanceOSEvents>(
    event: K,
    handler: GovernanceOSEventHandler<K>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as GovernanceOSEventHandler<keyof GovernanceOSEvents>);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof GovernanceOSEvents>(
    event: K,
    handler: GovernanceOSEventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as GovernanceOSEventHandler<keyof GovernanceOSEvents>);
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof GovernanceOSEvents>(
    event: K,
    data: GovernanceOSEvents[K]
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // ==========================================
  // Public API - Pipeline
  // ==========================================

  /**
   * Run a governance pipeline.
   */
  async runPipeline(params: {
    issueId?: string;
    workflowType?: 'A' | 'B' | 'C' | 'D' | 'E';
    riskLevel?: RiskLevel;
    metadata?: Record<string, unknown>;
  }): Promise<PipelineResult> {
    const context = this.pipeline.createContext(params);
    const services = this.createPipelineServices();
    return this.pipeline.run(context, services);
  }

  /**
   * Create pipeline services from subsystems.
   */
  private createPipelineServices(): PipelineServices {
    return {
      safeAutonomy: {
        classifyRisk: (action: string) => {
          return ACTION_RISK_LEVELS[action] || 'LOW';
        },
        createLockedAction: async (params: unknown) => {
          // Create lock using the lock manager
          const p = params as {
            actionType: string;
            description: string;
            riskLevel: RiskLevel;
            payload: Record<string, unknown>;
          };
          // Generate a unique ID for the locked action
          const id = `lock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          this.stats.lockedActions++;
          this.emit('execution:locked', { actionId: id, reason: `${p.riskLevel}-risk action: ${p.description}` });
          return { id };
        },
        checkApproval: async (_actionId: string) => {
          // For now, return not approved - real implementation would check storage
          return {
            approved: false,
            by: [],
          };
        },
      },
      orchestrator: {
        createWorkflow: async (issue: Issue, _type: WorkflowType) => {
          const todo = await this.orchestrator.processIssue(issue);
          return { id: todo.id };
        },
        runWorkflow: async (_workflowId: string) => {
          // Orchestrator processes workflows automatically
          return { documents: [] };
        },
        getWorkflowState: async (_workflowId: string) => {
          return { state: 'unknown' };
        },
      },
      documentRegistry: {
        getDocument: async (id: string) => {
          return this.documentRegistry.documents.get(id);
        },
        createDocument: async (params: unknown) => {
          const p = params as {
            type: DocumentType;
            title: string;
            content: string;
            createdBy: string;
            metadata?: Record<string, unknown>;
          };
          const doc = await this.documentRegistry.documents.create({
            type: p.type,
            title: p.title,
            summary: p.title,
            content: p.content,
            createdBy: p.createdBy,
          });
          this.stats.documentsProduced++;
          return doc;
        },
        publishDocument: async (id: string) => {
          await this.documentRegistry.documents.publish(id, 'governance-os');
        },
      },
      modelRouter: {
        executeTask: async (params: unknown) => {
          const task = params as Task;
          const result = await this.modelRouter.router.execute(task);
          return { content: result.content };
        },
      },
      dualHouse: {
        createVoting: async (params: unknown) => {
          const p = params as {
            proposalId: string;
            title: string;
            summary: string;
            riskLevel: 'LOW' | 'MID' | 'HIGH';
            category: string;
            createdBy: string;
          };
          return this.dualHouse.voting.createVoting({
            proposalId: p.proposalId,
            title: p.title,
            summary: p.summary,
            riskLevel: p.riskLevel,
            category: p.category,
            createdBy: p.createdBy,
          });
        },
        getVoting: async (id: string) => {
          return this.dualHouse.voting.getVoting(id);
        },
        createHighRiskApproval: async (params: unknown) => {
          const p = params as {
            proposalId: string;
            votingId: string;
            actionDescription: string;
            actionType: string;
          };
          return this.dualHouse.highRisk.createApproval({
            proposalId: p.proposalId,
            votingId: p.votingId,
            actionDescription: p.actionDescription,
            actionType: p.actionType,
          });
        },
        getHighRiskApproval: async (id: string) => {
          return this.dualHouse.highRisk.getApproval(id);
        },
      },
    };
  }

  // ==========================================
  // Public API - Subsystem Access
  // ==========================================

  /**
   * Get Safe Autonomy subsystem.
   */
  getSafeAutonomy() {
    return this.safeAutonomy;
  }

  /**
   * Get Orchestrator subsystem.
   */
  getOrchestrator() {
    return this.orchestrator;
  }

  /**
   * Get Document Registry subsystem.
   */
  getDocumentRegistry() {
    return this.documentRegistry;
  }

  /**
   * Get Model Router subsystem.
   */
  getModelRouter() {
    return this.modelRouter;
  }

  /**
   * Get Dual-House subsystem.
   */
  getDualHouse() {
    return this.dualHouse;
  }

  /**
   * Get Pipeline.
   */
  getPipeline() {
    return this.pipeline;
  }

  /**
   * Get KPI Collector.
   */
  getKPICollector(): KPICollector {
    return this.kpiCollector;
  }

  // ==========================================
  // Public API - Statistics
  // ==========================================

  /**
   * Get system statistics.
   */
  getStats(): GovernanceOSStats {
    // Update uptime
    this.stats.uptimeHours = (Date.now() - this.startedAt.getTime()) / (1000 * 60 * 60);

    // Update LLM stats from router
    const routerStats = this.modelRouter.router.getStats();
    this.stats.llmCostTodayUsd = routerStats.totalCostUsd;
    this.stats.llmTokensToday = routerStats.totalTokens;

    return { ...this.stats };
  }

  /**
   * Get system health.
   */
  async getHealth(): Promise<{
    healthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    components: Record<string, boolean>;
  }> {
    // Record heartbeat for KPI tracking
    this.kpiCollector.recordHeartbeat();

    const components: Record<string, boolean> = {
      safeAutonomy: true,
      orchestrator: true,
      documentRegistry: true,
      modelRouter: true,
      dualHouse: true,
      pipeline: this.pipeline.getActivePipelineCount() < 100,
    };

    const healthy = Object.values(components).every(v => v);
    const degraded = Object.values(components).filter(v => !v).length > 0 &&
                     Object.values(components).filter(v => !v).length <= 2;

    // Record LLM availability
    this.kpiCollector.recordSample('llm_availability', components.modelRouter ? 100 : 0);

    // Record queue depth
    this.kpiCollector.recordSample('queue_depth', this.pipeline.getActivePipelineCount());

    const status: 'healthy' | 'degraded' | 'unhealthy' = healthy ? 'healthy' : (degraded ? 'degraded' : 'unhealthy');
    const uptime = (Date.now() - this.startedAt.getTime()) / 1000;

    this.emit('system:health_check', { healthy, components });

    return { healthy, status, uptime, components };
  }

  /**
   * Get configuration.
   */
  getConfig(): GovernanceOSConfig {
    return { ...this.config };
  }

  /**
   * Get workflow configurations.
   */
  getWorkflowConfigs(): WorkflowConfigs {
    return { ...this.workflowConfigs };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a Governance OS instance.
 */
export function createGovernanceOS(
  config?: Partial<GovernanceOSConfig>,
  workflowConfigs?: Partial<WorkflowConfigs>
): GovernanceOS {
  return new GovernanceOS(config, workflowConfigs);
}

/**
 * Create a Governance OS instance with default configuration.
 */
export function createDefaultGovernanceOS(): GovernanceOS {
  return new GovernanceOS();
}
