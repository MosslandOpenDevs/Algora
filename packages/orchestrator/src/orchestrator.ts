// ===========================================
// Primary Orchestrator for Algora v2.0
// ===========================================

import type { RiskLevel } from '@algora/safe-autonomy';
import type {
  WorkflowType,
  WorkflowState,
  WorkflowContext,
  Issue,
  PriorityScore,
  TopicCategory,
  ImpactFactors,
  UrgencyFactors,
  FeasibilityFactors,
  OrchestratorConfig,
  OrchestratorEvents,
  OrchestratorTodo,
  SpecialistCode,
  SpecialistOutput,
  DecisionPacketDraft,
} from './types.js';
import {
  TOPIC_WEIGHTS,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './types.js';
import {
  WorkflowStateMachine,
  createWorkflowContext,
  type StateMachineEvent,
} from './state-machine.js';
import {
  TodoManager,
  createStatesTasks,
  type TodoEvent,
} from './todo-manager.js';
import {
  SpecialistManager,
  type SpecialistEvent,
  type LLMProvider,
} from './specialist-manager.js';
import {
  WorkflowAHandler,
  type ResearchDigest,
  type TechnologyAssessment,
} from './workflows/workflow-a.js';
import {
  WorkflowBHandler,
  type DebateSummary,
  type DebateTopic,
} from './workflows/workflow-b.js';
import {
  WorkflowCHandler,
  type GrantApplication,
  type GrantProposal,
  type DeveloperGrant,
  type MilestoneReport,
  type RetroactiveReward,
} from './workflows/workflow-c.js';
import {
  WorkflowDHandler,
  type ExpansionOpportunity,
  type OpportunityAssessment,
  type EcosystemReport,
} from './workflows/workflow-d.js';
import {
  WorkflowEHandler,
  type WorkingGroupProposal,
  type WGProposalEvaluation,
  type WGStatusReport,
} from './workflows/workflow-e.js';

/**
 * Event listener type for orchestrator events.
 */
export type OrchestratorEventListener<K extends keyof OrchestratorEvents> = (
  event: OrchestratorEvents[K]
) => void;

/**
 * Storage interface for workflow contexts.
 */
export interface WorkflowStorage {
  saveContext(context: WorkflowContext): Promise<void>;
  getContext(issueId: string): Promise<WorkflowContext | null>;
  getAllContexts(): Promise<WorkflowContext[]>;
  getContextsByState(state: WorkflowState): Promise<WorkflowContext[]>;
}

/**
 * In-memory workflow storage implementation.
 */
export class InMemoryWorkflowStorage implements WorkflowStorage {
  private contexts: Map<string, WorkflowContext> = new Map();

  async saveContext(context: WorkflowContext): Promise<void> {
    this.contexts.set(context.issueId, context);
  }

  async getContext(issueId: string): Promise<WorkflowContext | null> {
    return this.contexts.get(issueId) || null;
  }

  async getAllContexts(): Promise<WorkflowContext[]> {
    return Array.from(this.contexts.values());
  }

  async getContextsByState(state: WorkflowState): Promise<WorkflowContext[]> {
    return Array.from(this.contexts.values()).filter(
      (ctx) => ctx.currentState === state
    );
  }
}

/**
 * Agent summoning matrix for dynamic summoning.
 */
const SUMMONING_MATRIX: Record<TopicCategory, { cluster: string; count: number }[]> = {
  mossland_expansion: [
    { cluster: 'Visionaries', count: 2 },
    { cluster: 'Partnerships', count: 2 },
    { cluster: 'Strategists', count: 1 },
  ],
  blockchain_ai_ecosystem: [
    { cluster: 'Builders', count: 3 },
    { cluster: 'Strategists', count: 1 },
    { cluster: 'Researchers', count: 1 },
  ],
  community_governance: [
    { cluster: 'Community', count: 2 },
    { cluster: 'Moderators', count: 2 },
    { cluster: 'Guardians', count: 1 },
  ],
  technical_infrastructure: [
    { cluster: 'Builders', count: 3 },
    { cluster: 'Guardians', count: 2 },
  ],
  open_general: [
    { cluster: 'Moderators', count: 2 },
    { cluster: 'Community', count: 2 },
    { cluster: 'Advisors', count: 1 },
  ],
};

/**
 * Options for the orchestrator.
 */
export interface OrchestratorOptions {
  config?: OrchestratorConfig;
  workflowStorage?: WorkflowStorage;
  llmProvider: LLMProvider;
}

/**
 * Primary Orchestrator for Algora v2.0.
 *
 * The orchestrator is the central coordinator for all governance workflows.
 * It manages issue intake, workflow dispatch, specialist coordination,
 * TODO continuation, and state management.
 */
export class Orchestrator {
  private config: OrchestratorConfig;
  private workflowStorage: WorkflowStorage;
  private todoManager: TodoManager;
  private specialistManager: SpecialistManager;
  private workflowAHandler: WorkflowAHandler;
  private workflowBHandler: WorkflowBHandler;
  private workflowCHandler: WorkflowCHandler;
  private workflowDHandler: WorkflowDHandler;
  private workflowEHandler: WorkflowEHandler;
  private stateMachines: Map<string, WorkflowStateMachine> = new Map();
  private eventListeners: Map<keyof OrchestratorEvents, Set<OrchestratorEventListener<keyof OrchestratorEvents>>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(options: OrchestratorOptions) {
    this.config = options.config || DEFAULT_ORCHESTRATOR_CONFIG;
    this.workflowStorage = options.workflowStorage || new InMemoryWorkflowStorage();

    // Initialize TODO manager
    this.todoManager = new TodoManager({ config: this.config });
    this.todoManager.subscribe((event) => this.handleTodoEvent(event));

    // Initialize specialist manager
    this.specialistManager = new SpecialistManager({
      config: this.config,
      llmProvider: options.llmProvider,
    });
    this.specialistManager.subscribe((event) => this.handleSpecialistEvent(event));

    // Initialize workflow handlers
    this.workflowAHandler = new WorkflowAHandler(options.llmProvider);
    this.workflowBHandler = new WorkflowBHandler(options.llmProvider);
    this.workflowCHandler = new WorkflowCHandler(options.llmProvider);
    this.workflowDHandler = new WorkflowDHandler(options.llmProvider);
    this.workflowEHandler = new WorkflowEHandler(options.llmProvider);
  }

  /**
   * Start the orchestrator.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Recover any pending TODOs
    await this.todoManager.recover();

    // Start heartbeat
    this.startHeartbeat();

    console.log('Orchestrator started');
  }

  /**
   * Stop the orchestrator.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Stop heartbeat
    this.stopHeartbeat();

    console.log('Orchestrator stopped');
  }

  /**
   * Process a new issue.
   */
  async processIssue(issue: Issue): Promise<OrchestratorTodo> {
    // Emit issue received event
    this.emitEvent('issue:received', { issue });

    // Determine workflow type based on category
    const workflowType = this.determineWorkflowType(issue);

    // Create workflow context
    const context = createWorkflowContext(issue.id, issue, workflowType);
    await this.workflowStorage.saveContext(context);

    // Create state machine
    const stateMachine = new WorkflowStateMachine(context);
    stateMachine.subscribe((event) => this.handleStateMachineEvent(event));
    this.stateMachines.set(issue.id, stateMachine);

    // Create TODO
    const todo = await this.todoManager.createTodo(issue.id, workflowType);

    // Emit workflow started event
    this.emitEvent('workflow:started', { todo });

    // Add initial tasks
    const initialTasks = createStatesTasks('INTAKE', { issueId: issue.id });
    for (const task of initialTasks) {
      await this.todoManager.addTask(todo.id, task);
    }

    return todo;
  }

  /**
   * Advance a workflow to the next state.
   */
  async advanceWorkflow(
    issueId: string,
    reason: string = 'Automatic advancement'
  ): Promise<WorkflowContext | null> {
    const stateMachine = this.stateMachines.get(issueId);
    if (!stateMachine) {
      throw new Error(`No state machine found for issue: ${issueId}`);
    }

    const fromState = stateMachine.getCurrentState();
    const nextState = stateMachine.getNextRecommendedState();

    if (!nextState) {
      console.log(`No next state available for ${issueId}`);
      return null;
    }

    // Transition
    const newContext = stateMachine.transition(nextState, reason, 'orchestrator');
    await this.workflowStorage.saveContext(newContext);

    // Update TODO state
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      await this.todoManager.updateState(todo.id, nextState);

      // Emit state changed event
      this.emitEvent('state:changed', { todo, fromState, toState: nextState });

      // Add tasks for new state
      const tasks = createStatesTasks(nextState, { issueId });
      for (const task of tasks) {
        await this.todoManager.addTask(todo.id, task);
      }
    }

    return newContext;
  }

  /**
   * Calculate priority score for an issue.
   */
  calculatePriorityScore(
    category: TopicCategory,
    impact: ImpactFactors,
    urgency: UrgencyFactors,
    feasibility: FeasibilityFactors,
    riskPenalty: number = 0
  ): PriorityScore {
    const topicWeight = TOPIC_WEIGHTS[category];
    const impactScore =
      impact.revenuePotential + impact.userBaseAffected + impact.strategicAlignment;
    const urgencyScore =
      urgency.timeSensitivity + urgency.competitivePressure + urgency.dependencyBlocking;
    const feasibilityScore =
      feasibility.technicalReadiness +
      feasibility.resourceAvailability +
      feasibility.clearRequirements;

    const total = topicWeight + impactScore + urgencyScore + feasibilityScore + riskPenalty;

    return {
      topicWeight,
      impact: impactScore,
      urgency: urgencyScore,
      feasibility: feasibilityScore,
      riskPenalty,
      total: Math.max(0, Math.min(200, total)),
    };
  }

  /**
   * Select agents for an issue based on category.
   */
  selectAgents(category: TopicCategory): string[] {
    const summons = SUMMONING_MATRIX[category] || SUMMONING_MATRIX.open_general;
    const agents: string[] = [];

    for (const summon of summons) {
      for (let i = 0; i < summon.count; i++) {
        agents.push(`${summon.cluster.toLowerCase()}-${i + 1}`);
      }
    }

    return agents;
  }

  /**
   * Dispatch a specialist task.
   */
  async dispatchSpecialist(
    issueId: string,
    specialistCode: SpecialistCode,
    prompt: string,
    context: Record<string, unknown> = {}
  ): Promise<SpecialistOutput> {
    const task = await this.specialistManager.createTask(
      specialistCode,
      issueId,
      prompt,
      { ...context, issueId }
    );

    // Emit task assigned event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('task:assigned', { task });
    }

    const output = await this.specialistManager.executeTask(task.id);

    // Emit task completed event
    if (todo) {
      this.emitEvent('task:completed', { task, output });
    }

    return output;
  }

  /**
   * Check if an issue requires human review.
   */
  checkReviewRequired(context: WorkflowContext): { required: boolean; riskLevel: RiskLevel } {
    // Determine risk level based on workflow type and state
    let riskLevel: RiskLevel = 'LOW';

    if (context.workflowType === 'C' || context.workflowType === 'D') {
      // Developer support and ecosystem expansion may involve funds
      riskLevel = 'HIGH';
    } else if (context.workflowType === 'E') {
      // Working groups need moderate review
      riskLevel = 'MID';
    }

    // Check priority score
    if (context.priorityScore && context.priorityScore.total >= 150) {
      riskLevel = 'HIGH';
    }

    // Check risk penalty
    if (context.priorityScore && context.priorityScore.riskPenalty <= -50) {
      riskLevel = 'HIGH';
    }

    const required = riskLevel === 'HIGH';

    // Emit review required event if needed
    if (required) {
      const todo = this.getTodoSync(context.issueId);
      if (todo) {
        this.emitEvent('review:required', { todo, riskLevel });
      }
    }

    return { required, riskLevel };
  }

  /**
   * Generate a decision packet for an issue.
   */
  async generateDecisionPacket(issueId: string): Promise<DecisionPacketDraft> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    // Get drafter to create the decision packet
    const output = await this.dispatchSpecialist(
      issueId,
      'DRA',
      `Create a decision packet for the following issue:
Title: ${context.issue.title}
Description: ${context.issue.description}
Category: ${context.issue.category}
Research Brief: ${context.researchBrief || 'Not available'}
Agent Opinions: ${JSON.stringify(context.agentOpinions || [])}`,
      { context }
    );

    // Create decision packet draft
    const packet: DecisionPacketDraft = {
      id: `DP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${issueId.slice(0, 5)}`,
      issueId,
      options: [
        {
          id: 'option-a',
          name: 'Option A',
          description: 'Primary recommendation based on analysis',
          pros: ['Aligns with strategy', 'Feasible with current resources'],
          cons: ['May require additional budget'],
          risks: ['Market timing uncertainty'],
          estimatedCost: 0,
          estimatedTimeline: 'Q1 2026',
        },
        {
          id: 'option-b',
          name: 'Option B',
          description: 'Alternative approach with lower risk',
          pros: ['Lower risk', 'Faster implementation'],
          cons: ['Limited impact'],
          risks: ['May not fully address the issue'],
          estimatedCost: 0,
          estimatedTimeline: 'Q1 2026',
        },
        {
          id: 'option-c',
          name: 'Option C',
          description: 'Conservative approach - minimal action',
          pros: ['Low cost', 'Preserves options'],
          cons: ['Does not address core issue'],
          risks: ['Problem may escalate'],
          estimatedCost: 0,
          estimatedTimeline: 'Immediate',
        },
      ],
      recommendation: {
        optionId: 'option-a',
        reasons: ['Best alignment with goals', 'Positive ROI expected'],
        confidence: output.confidenceScore,
      },
      counterarguments: 'Red team analysis would go here',
      executionPlan: [
        { step: 1, action: 'Initial setup', owner: 'TBD', timeline: 'Week 1', dependencies: [] },
        { step: 2, action: 'Implementation', owner: 'TBD', timeline: 'Week 2-4', dependencies: ['Step 1'] },
        { step: 3, action: 'Review and launch', owner: 'TBD', timeline: 'Week 5', dependencies: ['Step 2'] },
      ],
      kpis: [
        { metric: 'Success metric 1', target: 'TBD', measurementMethod: 'TBD', timeline: '3 months' },
      ],
      provenance: {
        contentHash: output.contentHash,
        createdBy: output.agentId,
        modelUsed: output.modelUsed,
      },
    };

    // Update context with decision packet
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({ decisionPacket: packet });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Emit decision ready event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('decision:ready', { todo, decisionPacket: packet });
    }

    return packet;
  }

  /**
   * Execute Workflow A (Academic Activity) for an issue.
   * This workflow researches and synthesizes AI/blockchain academic developments.
   */
  async executeWorkflowA(issueId: string): Promise<{
    researchDigest?: ResearchDigest;
    technologyAssessment?: TechnologyAssessment;
    success: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    if (context.workflowType !== 'A') {
      throw new Error(`Issue ${issueId} is not assigned to Workflow A`);
    }

    // Convert signal IDs to signal objects for research
    // In production, this would fetch actual signal data from storage
    const signalIds = context.issue.signalIds || [];
    const signals = signalIds.map((id) => ({
      title: `Signal ${id}`,
      content: `Content for signal ${id}`,
      source: 'system',
      url: undefined,
    }));

    // Execute research phase
    const { researchBrief, papers } = await this.workflowAHandler.executeResearchPhase(
      context,
      signals
    );

    // Update context with research brief
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        researchBrief: researchBrief.summary,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Execute deliberation phase
    const { opinions, consensusScore } = await this.workflowAHandler.executeDeliberationPhase(
      context,
      researchBrief
    );

    // Update context with opinions
    if (stateMachine) {
      stateMachine.updateContext({
        agentOpinions: opinions,
        consensusScore,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Generate weekly research digest
    const weekNumber = this.getWeekNumber(new Date());
    const year = new Date().getFullYear();
    const researchDigest = await this.workflowAHandler.generateResearchDigest(
      papers,
      weekNumber,
      year
    );

    // Check if we should generate a technology assessment
    let technologyAssessment: TechnologyAssessment | undefined;
    if (this.workflowAHandler.shouldGenerateAssessment(researchBrief)) {
      technologyAssessment = await this.workflowAHandler.generateTechnologyAssessment(
        context,
        researchBrief,
        opinions
      );
    }

    // Emit workflow completed event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('workflow:completed', {
        todo,
        outputs: {
          researchDigest,
          technologyAssessment,
        },
      });
    }

    return {
      researchDigest,
      technologyAssessment,
      success: true,
    };
  }

  /**
   * Execute Workflow B (Free Debate) for an issue.
   * This workflow handles open-ended deliberation on strategic questions.
   */
  async executeWorkflowB(issueId: string): Promise<{
    debateSummary: DebateSummary;
    consensusReached: boolean;
    success: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    if (context.workflowType !== 'B') {
      throw new Error(`Issue ${issueId} is not assigned to Workflow B`);
    }

    // Create debate topic from issue
    const topic: DebateTopic = {
      id: `topic-${issueId}`,
      title: context.issue.title,
      description: context.issue.description,
      source: context.issue.source === 'community' ? 'community' : 'strategic_query',
      category: this.mapCategoryToDebateCategory(context.issue.category),
      proposedBy: context.issue.source,
      backgroundContext: context.researchBrief,
      relatedIssues: context.issue.signalIds,
      createdAt: context.issue.createdAt,
    };

    // Execute full deliberation
    const { thread, consensus, opinions } = await this.workflowBHandler.executeFullDeliberation(
      context,
      topic
    );

    // Update context with debate results
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        agentOpinions: opinions,
        consensusScore: consensus.consensusScore,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Generate debate summary
    const debateSummary = await this.workflowBHandler.generateDebateSummary(
      thread,
      topic,
      consensus
    );

    // Emit workflow completed event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('workflow:completed', {
        todo,
        outputs: {
          debateSummary,
          consensusReached: consensus.consensusReached,
        },
      });
    }

    return {
      debateSummary,
      consensusReached: consensus.consensusReached,
      success: true,
    };
  }

  /**
   * Map issue category to debate category.
   */
  private mapCategoryToDebateCategory(
    category: TopicCategory
  ): 'strategy' | 'technology' | 'governance' | 'ecosystem' | 'community' | 'tokenomics' | 'partnerships' | 'open' {
    const mapping: Record<TopicCategory, 'strategy' | 'technology' | 'governance' | 'ecosystem' | 'community' | 'tokenomics' | 'partnerships' | 'open'> = {
      mossland_expansion: 'ecosystem',
      blockchain_ai_ecosystem: 'technology',
      community_governance: 'governance',
      technical_infrastructure: 'technology',
      open_general: 'open',
    };
    return mapping[category] || 'open';
  }

  /**
   * Execute Workflow C (Developer Support) for a grant application.
   * This workflow manages developer grants with Dual-House approval.
   */
  async executeWorkflowC(
    issueId: string,
    grantApplication: GrantApplication
  ): Promise<{
    grantProposal: GrantProposal;
    requiresDualHouse: boolean;
    requiresDirector3: boolean;
    success: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    if (context.workflowType !== 'C') {
      throw new Error(`Issue ${issueId} is not assigned to Workflow C`);
    }

    // Process the grant application
    const { proposal, evaluation, opinions } = await this.workflowCHandler.processGrantApplication(
      context,
      grantApplication
    );

    // Update context with grant evaluation
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        agentOpinions: opinions,
        grantProposal: proposal,
        grantEvaluation: evaluation,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Determine approval requirements
    const requiresDualHouse = this.workflowCHandler.requiresDualHouseApproval(
      grantApplication.requestedAmount
    );
    const requiresDirector3 = this.workflowCHandler.requiresDirector3Approval(
      grantApplication.requestedAmount
    );

    // Emit workflow event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('workflow:completed', {
        todo,
        outputs: {
          grantProposal: proposal,
          evaluation,
          requiresDualHouse,
          requiresDirector3,
        },
      });
    }

    return {
      grantProposal: proposal,
      requiresDualHouse,
      requiresDirector3,
      success: true,
    };
  }

  /**
   * Process a milestone report for a developer grant.
   */
  async processMilestoneReport(
    grantId: string,
    grant: DeveloperGrant,
    report: MilestoneReport
  ): Promise<{
    approved: boolean;
    feedback: string;
    disbursement?: {
      amount: number;
      isLocked: boolean;
      unlockRequirements: string[];
    };
  }> {
    const context = await this.workflowStorage.getContext(grantId);
    if (!context) {
      throw new Error(`Context not found for grant: ${grantId}`);
    }

    const { review, approved, feedback } = await this.workflowCHandler.processMilestoneReport(
      context,
      grant,
      report
    );

    let disbursement;
    if (approved) {
      const milestone = grant.milestones.find((m) => m.id === report.milestoneId);
      if (milestone) {
        disbursement = this.workflowCHandler.calculateDisbursement(grant, milestone);
      }
    }

    // Update context with review
    const stateMachine = this.stateMachines.get(grantId);
    if (stateMachine) {
      stateMachine.updateContext({
        milestoneReviews: [...(context.milestoneReviews || []), review],
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    return {
      approved,
      feedback,
      disbursement,
    };
  }

  /**
   * Process a retroactive reward nomination.
   */
  async processRetroactiveReward(
    issueId: string,
    reward: RetroactiveReward
  ): Promise<{
    approved: boolean;
    adjustedAmount?: number;
    requiresDirector3: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    const { evaluation, approved, adjustedAmount } = await this.workflowCHandler.processRetroactiveReward(
      context,
      reward
    );

    const requiresDirector3 = this.workflowCHandler.requiresDirector3Approval(
      adjustedAmount || reward.proposedAmount
    );

    // Update context
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        retroactiveRewardEvaluation: evaluation,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    return {
      approved,
      adjustedAmount,
      requiresDirector3,
    };
  }

  /**
   * Execute Workflow D (Ecosystem Expansion) for an issue.
   * This workflow evaluates partnership and expansion opportunities.
   */
  async executeWorkflowD(
    issueId: string,
    opportunity?: Partial<ExpansionOpportunity>
  ): Promise<{
    ecosystemReport?: EcosystemReport;
    opportunityAssessment?: OpportunityAssessment;
    success: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    if (context.workflowType !== 'D') {
      throw new Error(`Issue ${issueId} is not assigned to Workflow D`);
    }

    // Create opportunity from issue if not provided
    const expansionOpportunity: Omit<ExpansionOpportunity, 'id' | 'origin' | 'status' | 'detectedAt' | 'createdAt' | 'updatedAt'> = {
      title: opportunity?.title || context.issue.title,
      description: opportunity?.description || context.issue.description,
      category: (opportunity?.category as ExpansionOpportunity['category']) || 'partnership',
      significanceScore: opportunity?.significanceScore || 50,
      strategicFitScore: opportunity?.strategicFitScore || 50,
      riskScore: opportunity?.riskScore || 30,
      counterpartyName: opportunity?.counterpartyName,
      counterpartyType: opportunity?.counterpartyType,
      counterpartyWebsite: opportunity?.counterpartyWebsite,
    };

    // Process the opportunity
    const { opportunity: processedOpp, assessment, opinions } = await this.workflowDHandler.processCallBasedOpportunity(
      context,
      expansionOpportunity
    );

    // Update context with assessment
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        agentOpinions: opinions,
        consensusScore: assessment.overallScore,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Generate ecosystem report if opportunity is qualified
    let ecosystemReport: EcosystemReport | undefined;
    if (processedOpp.status === 'qualified') {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      ecosystemReport = await this.workflowDHandler.generateEcosystemReport(
        context,
        periodStart,
        now,
        [processedOpp],
        [] // No partnerships for now
      );
    }

    // Emit workflow completed event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('workflow:completed', {
        todo,
        outputs: {
          workflowType: 'D',
          opportunityId: processedOpp.id,
          status: processedOpp.status,
          assessmentScore: assessment.overallScore,
          recommendation: assessment.recommendation,
        },
      });
    }

    return {
      ecosystemReport,
      opportunityAssessment: assessment,
      success: true,
    };
  }

  /**
   * Execute Workflow E (Working Groups) for an issue.
   * This workflow manages Working Group formation and operations.
   */
  async executeWorkflowE(
    issueId: string,
    proposal?: Partial<WorkingGroupProposal>
  ): Promise<{
    wgProposal?: WorkingGroupProposal;
    evaluation?: WGProposalEvaluation;
    statusReport?: WGStatusReport;
    success: boolean;
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    if (!context) {
      throw new Error(`Context not found for issue: ${issueId}`);
    }

    if (context.workflowType !== 'E') {
      throw new Error(`Issue ${issueId} is not assigned to Workflow E`);
    }

    // Create WG proposal from issue if not provided
    const wgProposal: Omit<WorkingGroupProposal, 'id' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'> = {
      name: proposal?.name || `WG: ${context.issue.title}`,
      purpose: proposal?.purpose || context.issue.description,
      scope: proposal?.scope || [context.issue.category],
      chairAgent: proposal?.chairAgent || 'nova-prime',
      memberAgents: proposal?.memberAgents || ['atlas', 'archive-alpha'],
      humanLiaison: proposal?.humanLiaison,
      charterDuration: proposal?.charterDuration || '6m',
      publishingAuthority: proposal?.publishingAuthority || ['wg_report', 'status_update'],
      origin: proposal?.origin || 'orchestrator',
      originDetails: `Auto-generated from issue ${issueId}`,
      requiredApprovals: proposal?.requiredApprovals || {
        mossCoinHouse: true,
        openSourceHouse: true,
        director3: false,
      },
      proposedBy: proposal?.proposedBy || 'orchestrator',
      proposedAt: proposal?.proposedAt || new Date(),
    };

    // Process the WG proposal
    const { proposal: processedProposal, evaluation, opinions } = await this.workflowEHandler.processWGProposal(
      context,
      wgProposal
    );

    // Update context with evaluation
    const stateMachine = this.stateMachines.get(issueId);
    if (stateMachine) {
      stateMachine.updateContext({
        agentOpinions: opinions,
        consensusScore: evaluation.overallScore,
      });
      await this.workflowStorage.saveContext(stateMachine.getContext());
    }

    // Generate status report if proposal is approved (skip for now as it requires WG to be registered)
    const statusReport: WGStatusReport | undefined = undefined;
    // Note: Status reports require a registered working group with ID
    // This will be generated when the WG is formally created after approval

    // Emit workflow completed event
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    if (todo) {
      this.emitEvent('workflow:completed', {
        todo,
        outputs: {
          workflowType: 'E',
          proposalId: processedProposal.id,
          status: processedProposal.status,
          evaluationScore: evaluation.overallScore,
          recommendation: evaluation.recommendation,
        },
      });
    }

    return {
      wgProposal: processedProposal,
      evaluation,
      statusReport,
      success: true,
    };
  }

  /**
   * Get the week number of a date.
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get workflow status for an issue.
   */
  async getWorkflowStatus(issueId: string): Promise<{
    context: WorkflowContext | null;
    todo: OrchestratorTodo | null;
    availableTransitions: WorkflowState[];
  }> {
    const context = await this.workflowStorage.getContext(issueId);
    const todo = await this.todoManager.getTodoByIssueId(issueId);
    const stateMachine = this.stateMachines.get(issueId);

    return {
      context,
      todo,
      availableTransitions: stateMachine?.getAvailableTransitions() || [],
    };
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<{
    queueDepth: number;
    pendingTodos: number;
    blockedTodos: number;
    activeSpecialists: number;
  }> {
    const queueDepth = await this.todoManager.getQueueDepth();
    const pendingTodos = (await this.todoManager.getPendingTodos()).length;
    const blockedTodos = (await this.todoManager.getBlockedTodos()).length;
    const activeSpecialists = this.specialistManager.getActiveCount();

    return {
      queueDepth,
      pendingTodos,
      blockedTodos,
      activeSpecialists,
    };
  }

  /**
   * Subscribe to orchestrator events.
   */
  on<K extends keyof OrchestratorEvents>(
    event: K,
    listener: OrchestratorEventListener<K>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const listeners = this.eventListeners.get(event)!;
    listeners.add(listener as OrchestratorEventListener<keyof OrchestratorEvents>);

    return () => {
      listeners.delete(listener as OrchestratorEventListener<keyof OrchestratorEvents>);
    };
  }

  /**
   * Determine workflow type based on issue category.
   */
  private determineWorkflowType(issue: Issue): WorkflowType {
    // Map categories to workflow types
    const categoryWorkflows: Record<TopicCategory, WorkflowType> = {
      mossland_expansion: 'D',
      blockchain_ai_ecosystem: 'A',
      community_governance: 'B',
      technical_infrastructure: 'C',
      open_general: 'B',
    };

    return categoryWorkflows[issue.category] || 'B';
  }

  /**
   * Handle state machine events.
   */
  private handleStateMachineEvent(event: StateMachineEvent): void {
    if (event.type === 'transition') {
      console.log(
        `State transition: ${event.fromState} -> ${event.toState} (${event.context.issueId})`
      );
    }
  }

  /**
   * Handle TODO events.
   */
  private handleTodoEvent(event: TodoEvent): void {
    if (event.type === 'todo:blocked') {
      this.todoManager.getTodo(event.todoId).then((todo) => {
        if (todo) {
          this.emitEvent('todo:blocked', {
            todo,
            reason: event.metadata?.reason as string || 'Unknown reason',
          });
        }
      });
    } else if (event.type === 'todo:resumed') {
      this.todoManager.getTodo(event.todoId).then((todo) => {
        if (todo) {
          this.emitEvent('todo:resumed', { todo });
        }
      });
    }
  }

  /**
   * Handle specialist events.
   */
  private handleSpecialistEvent(event: SpecialistEvent): void {
    if (event.type === 'task:failed') {
      console.error(`Specialist task failed: ${event.taskId}`, event.metadata);
    }
  }

  /**
   * Start heartbeat for system liveness.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Log heartbeat
      console.log(`Orchestrator heartbeat: ${new Date().toISOString()}`);
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Emit an orchestrator event.
   */
  private emitEvent<K extends keyof OrchestratorEvents>(
    event: K,
    data: OrchestratorEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    for (const listener of listeners) {
      try {
        (listener as OrchestratorEventListener<K>)(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }

  /**
   * Synchronous TODO getter (uses cache).
   */
  private getTodoSync(_issueId: string): OrchestratorTodo | null {
    // This is a simplified sync version - in production would use a cache
    return null;
  }
}

/**
 * Create a new orchestrator instance.
 */
export function createOrchestrator(options: OrchestratorOptions): Orchestrator {
  return new Orchestrator(options);
}
