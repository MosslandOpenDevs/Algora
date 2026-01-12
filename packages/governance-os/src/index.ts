// ===========================================
// Governance OS - Main Exports
// ===========================================

// Types
export type {
  GovernanceOSConfig,
  PipelineStage,
  PipelineContext,
  PipelineResult,
  WorkflowAConfig,
  WorkflowBConfig,
  WorkflowCConfig,
  WorkflowDConfig,
  WorkflowEConfig,
  WorkflowConfigs,
  GovernanceOSEvents,
  GovernanceOSStats,
} from './types.js';

export {
  DEFAULT_GOVERNANCE_OS_CONFIG,
  DEFAULT_WORKFLOW_CONFIGS,
  WORKFLOW_DOCUMENT_OUTPUTS,
  DUAL_APPROVAL_DOCUMENTS,
  DIRECTOR3_REQUIRED_DOCUMENTS,
  ACTION_RISK_LEVELS,
  SPECIALIST_DIFFICULTY_MAPPING,
  DOCUMENT_DIFFICULTY_MAPPING,
} from './types.js';

// Pipeline
export type {
  PipelineEvents,
  StageHandler,
  PipelineServices,
  PipelineConfig,
} from './pipeline.js';

export {
  GovernancePipeline,
  DEFAULT_PIPELINE_CONFIG,
  createPipeline,
} from './pipeline.js';

// Governance OS
export {
  GovernanceOS,
  createGovernanceOS,
  createDefaultGovernanceOS,
} from './governance-os.js';

// Re-export core types from dependencies for convenience
export type {
  RiskLevel,
  LockedAction,
} from '@algora/safe-autonomy';

export type {
  WorkflowType,
  WorkflowState,
  Issue,
  SpecialistCode,
} from '@algora/orchestrator';

export type {
  DocumentType,
  DocumentState,
  Document,
} from '@algora/document-registry';

export type {
  DifficultyLevel,
  Task,
} from '@algora/model-router';

export type {
  HouseType,
  DualHouseVoting,
  ReconciliationMemo,
  HighRiskApproval,
} from '@algora/dual-house';

// KPI Instrumentation
export type {
  DecisionQualityMetrics,
  ExecutionSpeedMetrics,
  SystemHealthMetrics,
  KPIDashboard,
  KPITargets,
  KPIAlert,
  KPIEvents,
} from './kpi.js';

export {
  KPICollector,
  DEFAULT_KPI_TARGETS,
  getKPICollector,
  createKPICollector,
} from './kpi.js';
