// ===========================================
// Orchestrator Types for Algora v2.0
// ===========================================

import type { RiskLevel } from '@algora/safe-autonomy';

// ============================================
// Workflow Types
// ============================================

/**
 * The five fixed workflow types.
 */
export type WorkflowType = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Workflow type descriptions.
 */
export const WORKFLOW_DESCRIPTIONS: Record<WorkflowType, string> = {
  A: 'Agentic AI Academic Activity',
  B: 'Agentic AI Free Debate',
  C: 'Mossland Developer Support Program',
  D: 'Mossland Ecosystem Expansion',
  E: 'Working Groups',
};

/**
 * States in the workflow state machine.
 */
export type WorkflowState =
  | 'INTAKE'
  | 'TRIAGE'
  | 'RESEARCH'
  | 'DELIBERATION'
  | 'DECISION_PACKET'
  | 'REVIEW'
  | 'PUBLISH'
  | 'EXEC_LOCKED'
  | 'OUTCOME_PROOF'
  | 'COMPLETED'
  | 'REJECTED'
  | 'ARCHIVED';

/**
 * Valid state transitions.
 */
export const STATE_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  INTAKE: ['TRIAGE'],
  TRIAGE: ['RESEARCH', 'DELIBERATION'],
  RESEARCH: ['DELIBERATION'],
  DELIBERATION: ['DECISION_PACKET', 'REJECTED'],
  DECISION_PACKET: ['REVIEW', 'PUBLISH'],
  REVIEW: ['PUBLISH', 'DECISION_PACKET', 'REJECTED'],
  PUBLISH: ['EXEC_LOCKED', 'COMPLETED'],
  EXEC_LOCKED: ['OUTCOME_PROOF', 'REJECTED'],
  OUTCOME_PROOF: ['COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  ARCHIVED: [],
};

// ============================================
// Issue Types
// ============================================

/**
 * Topic categories for priority scoring.
 */
export type TopicCategory =
  | 'mossland_expansion'
  | 'blockchain_ai_ecosystem'
  | 'community_governance'
  | 'technical_infrastructure'
  | 'open_general';

/**
 * Topic weight values.
 */
export const TOPIC_WEIGHTS: Record<TopicCategory, number> = {
  mossland_expansion: 100,
  blockchain_ai_ecosystem: 60,
  community_governance: 40,
  technical_infrastructure: 30,
  open_general: 20,
};

/**
 * Impact scoring factors.
 */
export interface ImpactFactors {
  revenuePotential: 0 | 10 | 20 | 30;
  userBaseAffected: 0 | 5 | 10 | 15;
  strategicAlignment: 0 | 5 | 10 | 15;
}

/**
 * Urgency scoring factors.
 */
export interface UrgencyFactors {
  timeSensitivity: 0 | 10 | 20;
  competitivePressure: 0 | 5 | 10;
  dependencyBlocking: 0 | 5 | 10;
}

/**
 * Feasibility scoring factors.
 */
export interface FeasibilityFactors {
  technicalReadiness: 0 | 5 | 10;
  resourceAvailability: 0 | 5 | 10;
  clearRequirements: 0 | 5 | 10;
}

/**
 * Complete priority score breakdown.
 */
export interface PriorityScore {
  topicWeight: number;
  impact: number;
  urgency: number;
  feasibility: number;
  riskPenalty: number;
  total: number;
}

/**
 * An issue to be processed by the orchestrator.
 */
export interface Issue {
  id: string;
  title: string;
  description: string;
  category: TopicCategory;
  source: string;
  signalIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Specialist Types
// ============================================

/**
 * Specialist agent codes.
 */
export type SpecialistCode =
  | 'RES'  // Researcher
  | 'ANA'  // Analyst
  | 'DRA'  // Drafter
  | 'REV'  // Reviewer
  | 'RED'  // Red Team
  | 'SUM'  // Summarizer
  | 'TRN'  // Translator
  | 'ARC'; // Archivist

/**
 * Specialist definitions.
 */
export interface SpecialistDefinition {
  code: SpecialistCode;
  name: string;
  deliverable: string;
  maxTokens: number;
}

/**
 * All specialist definitions.
 */
export const SPECIALISTS: Record<SpecialistCode, SpecialistDefinition> = {
  RES: { code: 'RES', name: 'Researcher', deliverable: 'Research Brief (5-10 sources)', maxTokens: 2000 },
  ANA: { code: 'ANA', name: 'Analyst', deliverable: 'Analysis Report (pros/cons/risks)', maxTokens: 3000 },
  DRA: { code: 'DRA', name: 'Drafter', deliverable: 'Document Draft (per template)', maxTokens: 4000 },
  REV: { code: 'REV', name: 'Reviewer', deliverable: 'Review Report (issues/improvements)', maxTokens: 1500 },
  RED: { code: 'RED', name: 'Red Team', deliverable: 'Adversarial Analysis (attack vectors)', maxTokens: 2000 },
  SUM: { code: 'SUM', name: 'Summarizer', deliverable: 'Executive Summary (3 bullets)', maxTokens: 500 },
  TRN: { code: 'TRN', name: 'Translator', deliverable: 'Korean Translation', maxTokens: 4000 },
  ARC: { code: 'ARC', name: 'Archivist', deliverable: 'Registry Entry', maxTokens: 500 },
};

/**
 * Output from a specialist agent.
 */
export interface SpecialistOutput {
  id: string;
  specialistCode: SpecialistCode;
  agentId: string;
  workflowStateId: string;
  outputType: string;
  content: string;
  contentHash: string;
  modelUsed: string;
  tokenCount: number;
  costUsd: number;
  confidenceScore: number;
  qualityGatePassed: boolean;
  createdAt: Date;
}

/**
 * A task assigned to a specialist.
 */
export interface SpecialistTask {
  id: string;
  specialistCode: SpecialistCode;
  agentId?: string;
  prompt: string;
  context: Record<string, unknown>;
  maxTokens: number;
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed';
  output?: SpecialistOutput;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================
// TODO Types
// ============================================

/**
 * A task in the orchestrator's TODO list.
 */
export interface OrchestratorTask {
  id: string;
  name: string;
  description: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed';
  blockedBy?: string;
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  createdAt: Date;
  completedAt?: Date;
  metadata: Record<string, unknown>;
}

/**
 * An orchestrator TODO item for tracking issue progress.
 */
export interface OrchestratorTodo {
  id: string;
  issueId: string;
  workflowType: WorkflowType;
  currentState: WorkflowState;
  pendingTasks: OrchestratorTask[];
  blockedBy?: string;
  retryCount: number;
  lastAttempt?: Date;
  nextAttempt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Workflow Context Types
// ============================================

/**
 * Context accumulated during workflow execution.
 */
export interface WorkflowContext {
  issueId: string;
  issue: Issue;
  workflowType: WorkflowType;
  currentState: WorkflowState;
  stateHistory: StateTransitionRecord[];

  // Accumulated data
  priorityScore?: PriorityScore;
  selectedAgents?: string[];
  researchBrief?: string;
  sources?: string[];
  agentOpinions?: AgentOpinion[];
  consensusScore?: number;
  decisionPacket?: DecisionPacketDraft;
  reviewStatus?: 'approved' | 'rejected' | 'changes_requested';
  registryId?: string;
  publishedAt?: Date;
  lockReason?: string;
  requiredApprovals?: string[];
  kpiResults?: KpiResult[];
  trustScoreUpdates?: TrustScoreUpdate[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record of a state transition.
 */
export interface StateTransitionRecord {
  fromState: WorkflowState;
  toState: WorkflowState;
  timestamp: Date;
  reason: string;
  triggeredBy: string;
}

/**
 * An agent's opinion during deliberation.
 */
export interface AgentOpinion {
  agentId: string;
  agentName: string;
  position: string;
  confidence: number;
  reasoning: string;
  timestamp: Date;
}

/**
 * Draft of a decision packet.
 */
export interface DecisionPacketDraft {
  id: string;
  issueId: string;
  options: DecisionOption[];
  recommendation: {
    optionId: string;
    reasons: string[];
    confidence: number;
  };
  counterarguments: string;
  executionPlan: ExecutionStep[];
  kpis: KpiDefinition[];
  provenance: {
    contentHash: string;
    createdBy: string;
    modelUsed: string;
  };
}

/**
 * A decision option in a decision packet.
 */
export interface DecisionOption {
  id: string;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  risks: string[];
  estimatedCost: number;
  estimatedTimeline: string;
}

/**
 * A step in an execution plan.
 */
export interface ExecutionStep {
  step: number;
  action: string;
  owner: string;
  timeline: string;
  dependencies: string[];
}

/**
 * Definition of a KPI.
 */
export interface KpiDefinition {
  metric: string;
  target: string;
  measurementMethod: string;
  timeline: string;
}

/**
 * Result of measuring a KPI.
 */
export interface KpiResult {
  metric: string;
  target: string;
  measured: number | string;
  achieved: boolean;
  notes?: string;
}

/**
 * Update to an agent's trust score.
 */
export interface TrustScoreUpdate {
  agentId: string;
  previousScore: number;
  newScore: number;
  reason: string;
  timestamp: Date;
}

// ============================================
// Acceptance Criteria Types
// ============================================

/**
 * Acceptance criteria for a workflow state.
 */
export interface AcceptanceCriteria {
  required: string[];
  validation: (ctx: WorkflowContext) => boolean;
}

/**
 * State acceptance criteria definitions.
 */
export const STATE_ACCEPTANCE: Record<WorkflowState, AcceptanceCriteria> = {
  INTAKE: {
    required: ['issueId', 'issue'],
    validation: (ctx) => ctx.issue.title.length > 10,
  },
  TRIAGE: {
    required: ['priorityScore', 'workflowType', 'selectedAgents'],
    validation: (ctx) =>
      ctx.priorityScore !== undefined &&
      ctx.priorityScore.total >= 0 &&
      ctx.priorityScore.total <= 200,
  },
  RESEARCH: {
    required: ['researchBrief', 'sources'],
    validation: (ctx) =>
      ctx.sources !== undefined && ctx.sources.length >= 3,
  },
  DELIBERATION: {
    required: ['agentOpinions', 'consensusScore'],
    validation: (ctx) =>
      ctx.agentOpinions !== undefined && ctx.agentOpinions.length >= 3,
  },
  DECISION_PACKET: {
    required: ['decisionPacket'],
    validation: (ctx) =>
      ctx.decisionPacket !== undefined &&
      ctx.decisionPacket.options.length >= 3 &&
      ctx.decisionPacket.provenance.contentHash !== '',
  },
  REVIEW: {
    required: ['reviewStatus'],
    validation: (ctx) =>
      ctx.reviewStatus !== undefined &&
      ['approved', 'rejected', 'changes_requested'].includes(ctx.reviewStatus),
  },
  PUBLISH: {
    required: ['registryId', 'publishedAt'],
    validation: (ctx) =>
      ctx.registryId !== undefined && ctx.registryId.startsWith('DOC-'),
  },
  EXEC_LOCKED: {
    required: ['lockReason', 'requiredApprovals'],
    validation: (ctx) =>
      ctx.requiredApprovals !== undefined && ctx.requiredApprovals.length > 0,
  },
  OUTCOME_PROOF: {
    required: ['kpiResults', 'trustScoreUpdates'],
    validation: (ctx) =>
      ctx.kpiResults !== undefined &&
      ctx.kpiResults.every((k) => k.measured !== undefined),
  },
  COMPLETED: {
    required: [],
    validation: () => true,
  },
  REJECTED: {
    required: [],
    validation: () => true,
  },
  ARCHIVED: {
    required: [],
    validation: () => true,
  },
};

// ============================================
// Event Types
// ============================================

/**
 * Events emitted by the orchestrator.
 */
export interface OrchestratorEvents {
  'issue:received': { issue: Issue };
  'workflow:started': { todo: OrchestratorTodo };
  'state:changed': { todo: OrchestratorTodo; fromState: WorkflowState; toState: WorkflowState };
  'task:assigned': { task: SpecialistTask };
  'task:completed': { task: SpecialistTask; output: SpecialistOutput };
  'task:failed': { task: SpecialistTask; error: string };
  'decision:ready': { todo: OrchestratorTodo; decisionPacket: DecisionPacketDraft };
  'review:required': { todo: OrchestratorTodo; riskLevel: RiskLevel };
  'workflow:completed': { todo: OrchestratorTodo; outputs?: Record<string, unknown> };
  'workflow:rejected': { todo: OrchestratorTodo; reason: string };
  'todo:blocked': { todo: OrchestratorTodo; reason: string };
  'todo:resumed': { todo: OrchestratorTodo };
}

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for the orchestrator.
 */
export interface OrchestratorConfig {
  // Retry settings
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;

  // Processing settings
  maxConcurrentTasks: number;
  taskTimeoutMs: number;

  // Quality settings
  minConfidenceScore: number;
  minConsensusScore: number;
  minAgentOpinions: number;
  minSources: number;
  minOptions: number;

  // Heartbeat
  heartbeatIntervalMs: number;
}

/**
 * Default orchestrator configuration.
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxRetries: 10,
  initialDelayMs: 1000,
  maxDelayMs: 3600000,
  backoffMultiplier: 2,
  maxConcurrentTasks: 5,
  taskTimeoutMs: 300000, // 5 minutes
  minConfidenceScore: 70,
  minConsensusScore: 60,
  minAgentOpinions: 3,
  minSources: 3,
  minOptions: 3,
  heartbeatIntervalMs: 30000, // 30 seconds
};
