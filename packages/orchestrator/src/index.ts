// ===========================================
// Orchestrator Package for Algora v2.0
// ===========================================

/**
 * @packageDocumentation
 *
 * The Orchestrator package provides the central coordination system
 * for Algora v2.0's autonomous governance workflows.
 *
 * ## Core Components
 *
 * - **Orchestrator**: Primary coordinator for all governance workflows
 * - **WorkflowStateMachine**: State machine for workflow transitions
 * - **TodoManager**: Persistent TODO list for task continuation
 * - **SpecialistManager**: Coordination of specialist subagents
 *
 * ## Example Usage
 *
 * ```typescript
 * import {
 *   createOrchestrator,
 *   createMockLLMProvider,
 * } from '@algora/orchestrator';
 *
 * const orchestrator = createOrchestrator({
 *   llmProvider: createMockLLMProvider(),
 * });
 *
 * await orchestrator.start();
 *
 * const todo = await orchestrator.processIssue({
 *   id: 'issue-001',
 *   title: 'New governance proposal',
 *   description: 'Description of the issue',
 *   category: 'community_governance',
 *   source: 'community',
 *   signalIds: ['signal-001'],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * });
 * ```
 *
 * ## Workflows
 *
 * The orchestrator supports five fixed workflow types:
 * - **A**: Agentic AI Academic Activity
 * - **B**: Agentic AI Free Debate
 * - **C**: Mossland Developer Support Program
 * - **D**: Mossland Ecosystem Expansion
 * - **E**: Working Groups
 */

// ============================================
// Types
// ============================================

export type {
  // Workflow types
  WorkflowType,
  WorkflowState,
  WorkflowContext,
  StateTransitionRecord,
  AcceptanceCriteria,

  // Issue types
  Issue,
  TopicCategory,
  ImpactFactors,
  UrgencyFactors,
  FeasibilityFactors,
  PriorityScore,

  // Specialist types
  SpecialistCode,
  SpecialistDefinition,
  SpecialistTask,
  SpecialistOutput,

  // TODO types
  OrchestratorTask,
  OrchestratorTodo,

  // Decision types
  AgentOpinion,
  DecisionPacketDraft,
  DecisionOption,
  ExecutionStep,
  KpiDefinition,
  KpiResult,
  TrustScoreUpdate,

  // Config types
  OrchestratorConfig,
  OrchestratorEvents,
} from './types.js';

export {
  // Constants
  WORKFLOW_DESCRIPTIONS,
  STATE_TRANSITIONS,
  TOPIC_WEIGHTS,
  SPECIALISTS,
  STATE_ACCEPTANCE,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './types.js';

// ============================================
// State Machine
// ============================================

export {
  WorkflowStateMachine,
  InvalidTransitionError,
  AcceptanceCriteriaError,
  createWorkflowContext,
  validateWorkflowPath,
  getPossiblePaths,
  DEFAULT_STATE_MACHINE_OPTIONS,
} from './state-machine.js';

export type {
  StateMachineEvent,
  StateMachineEventListener,
  StateMachineOptions,
} from './state-machine.js';

// ============================================
// TODO Manager
// ============================================

export {
  TodoManager,
  InMemoryTodoStorage,
  createStatesTasks,
} from './todo-manager.js';

export type {
  TodoEvent,
  TodoEventListener,
  TodoStorage,
  TodoManagerOptions,
} from './todo-manager.js';

// ============================================
// Specialist Manager
// ============================================

export {
  SpecialistManager,
  DefaultQualityGate,
  InMemoryTaskQueue,
  createMockLLMProvider,
} from './specialist-manager.js';

export type {
  SpecialistEvent,
  SpecialistEventListener,
  LLMProvider,
  QualityGate,
  TaskQueue,
  SpecialistManagerOptions,
} from './specialist-manager.js';

// ============================================
// Orchestrator
// ============================================

export {
  Orchestrator,
  InMemoryWorkflowStorage,
  createOrchestrator,
} from './orchestrator.js';

export type {
  OrchestratorEventListener,
  WorkflowStorage,
  OrchestratorOptions,
} from './orchestrator.js';

// ============================================
// Workflow Handlers
// ============================================

export {
  // Workflow A
  WorkflowAHandler,
  createWorkflowAHandler,
  DEFAULT_WORKFLOW_A_CONFIG,
  // Workflow B
  WorkflowBHandler,
  createWorkflowBHandler,
  DEFAULT_WORKFLOW_B_CONFIG,
  // Workflow C
  WorkflowCHandler,
  createWorkflowCHandler,
  DEFAULT_WORKFLOW_C_CONFIG,
} from './workflows/index.js';

export type {
  // Workflow A types
  AcademicSource,
  ResearchTopic,
  AcademicPaper,
  ResearchBrief,
  TechnologyAssessment,
  ResearchDigest,
  WorkflowAConfig,
  // Workflow B types
  DebateSource,
  DebateCategory,
  DebatePhase,
  DebateTopic,
  DebateArgument,
  DebateThread,
  ConsensusAssessment,
  DebateSummary,
  WorkflowBConfig,
  // Workflow C types
  GrantStatus,
  GrantCategory,
  MilestoneStatus,
  RewardStatus,
  GrantApplication,
  GrantMilestone,
  MilestoneEvidence,
  DeveloperGrant,
  MilestoneReport,
  RetroactiveReward,
  GrantProposal,
  WorkflowCConfig,
  ApplicationEvaluation,
  MilestoneReview,
  RewardEvaluation,
} from './workflows/index.js';
