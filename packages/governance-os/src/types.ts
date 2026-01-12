// ===========================================
// Governance OS Types - Unified Integration Layer
// ===========================================

import type { RiskLevel, LockedAction } from '@algora/safe-autonomy';
import type { WorkflowState, Issue, SpecialistCode } from '@algora/orchestrator';
import type { DocumentType, DocumentState, Document, DocumentVersion } from '@algora/document-registry';
import type { DifficultyLevel, Task, ModelSelection } from '@algora/model-router';
import type { HouseType, DualHouseVoting, ReconciliationMemo, HighRiskApproval } from '@algora/dual-house';

// ============================================
// Governance OS Configuration
// ============================================

/**
 * Complete Governance OS configuration.
 */
export interface GovernanceOSConfig {
  /** System name */
  name: string;
  /** System version */
  version: string;

  /** Safe Autonomy settings */
  safeAutonomy: {
    /** Enable LOCK mechanism */
    enableLocking: boolean;
    /** Default timeout hours for approvals */
    defaultTimeoutHours: number;
    /** Director 3 IDs */
    director3Ids: string[];
  };

  /** Orchestrator settings */
  orchestrator: {
    /** Maximum concurrent workflows */
    maxConcurrentWorkflows: number;
    /** Default workflow timeout hours */
    workflowTimeoutHours: number;
    /** Enable automatic issue detection */
    enableAutoIssueDetection: boolean;
  };

  /** Document Registry settings */
  documentRegistry: {
    /** Enable versioning */
    enableVersioning: boolean;
    /** Enable provenance tracking */
    enableProvenance: boolean;
    /** Audit retention days */
    auditRetentionDays: number;
  };

  /** Model Router settings */
  modelRouter: {
    /** Default LLM tier */
    defaultTier: 1 | 2;
    /** Daily budget USD */
    dailyBudgetUsd: number;
    /** Enable quality gates */
    enableQualityGates: boolean;
  };

  /** Dual-House settings */
  dualHouse: {
    /** Require dual approval for most decisions */
    requireDualApproval: boolean;
    /** Reconciliation timeout hours */
    reconciliationTimeoutHours: number;
    /** Require Director 3 for HIGH risk */
    requireDirector3ForHighRisk: boolean;
  };
}

/**
 * Default Governance OS configuration.
 */
export const DEFAULT_GOVERNANCE_OS_CONFIG: GovernanceOSConfig = {
  name: 'Algora Governance OS',
  version: '2.0.0',

  safeAutonomy: {
    enableLocking: true,
    defaultTimeoutHours: 72,
    director3Ids: [],
  },

  orchestrator: {
    maxConcurrentWorkflows: 10,
    workflowTimeoutHours: 168,
    enableAutoIssueDetection: true,
  },

  documentRegistry: {
    enableVersioning: true,
    enableProvenance: true,
    auditRetentionDays: 365,
  },

  modelRouter: {
    defaultTier: 1,
    dailyBudgetUsd: 10,
    enableQualityGates: true,
  },

  dualHouse: {
    requireDualApproval: true,
    reconciliationTimeoutHours: 72,
    requireDirector3ForHighRisk: true,
  },
};

// ============================================
// Integrated Pipeline Types
// ============================================

/**
 * Pipeline stages in the governance flow.
 */
export type PipelineStage =
  | 'signal_intake'
  | 'issue_detection'
  | 'workflow_dispatch'
  | 'specialist_work'
  | 'document_production'
  | 'dual_house_review'
  | 'approval_routing'
  | 'execution'
  | 'outcome_verification';

/**
 * Pipeline context passed through stages.
 */
export interface PipelineContext {
  /** Unique pipeline run ID */
  id: string;
  /** Current stage */
  stage: PipelineStage;
  /** Source issue ID */
  issueId?: string;
  /** Workflow type */
  workflowType?: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Workflow state */
  workflowState?: WorkflowState;
  /** Generated documents */
  documents: string[];
  /** Voting session ID */
  votingId?: string;
  /** Approval ID (for HIGH risk) */
  approvalId?: string;
  /** Locked action ID */
  lockedActionId?: string;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Started at */
  startedAt: Date;
  /** Completed stages */
  completedStages: PipelineStage[];
  /** Error if any */
  error?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Pipeline result.
 */
export interface PipelineResult {
  /** Pipeline context */
  context: PipelineContext;
  /** Whether pipeline completed successfully */
  success: boolean;
  /** Final status */
  status: 'completed' | 'pending_approval' | 'locked' | 'rejected' | 'error';
  /** Output documents */
  documents: Document[];
  /** Voting result if applicable */
  votingResult?: DualHouseVoting;
  /** Approval status if HIGH risk */
  approvalStatus?: HighRiskApproval;
  /** Execution result if executed */
  executionResult?: unknown;
}

// ============================================
// Workflow Integration Types
// ============================================

/**
 * Workflow A: Academic Activity configuration.
 */
export interface WorkflowAConfig {
  /** Sources to monitor */
  sources: string[];
  /** Digest frequency */
  digestFrequency: 'daily' | 'weekly';
  /** Auto-publish digests */
  autoPublishDigests: boolean;
}

/**
 * Workflow B: Free Debate configuration.
 */
export interface WorkflowBConfig {
  /** Minimum agents for debate */
  minAgents: number;
  /** Debate timeout hours */
  debateTimeoutHours: number;
  /** Require consensus for DP */
  requireConsensusForDP: boolean;
}

/**
 * Workflow C: Developer Support configuration.
 */
export interface WorkflowCConfig {
  /** Grant thresholds */
  grantThresholds: {
    /** Amount requiring single house */
    singleHouse: number;
    /** Amount requiring dual house */
    dualHouse: number;
    /** Amount requiring Director 3 */
    director3: number;
  };
  /** Enable retroactive rewards */
  enableRetroactiveRewards: boolean;
}

/**
 * Workflow D: Ecosystem Expansion configuration.
 */
export interface WorkflowDConfig {
  /** Enable always-on scanning */
  enableAlwaysOn: boolean;
  /** Scan interval hours */
  scanIntervalHours: number;
  /** Significance threshold */
  significanceThreshold: number;
  /** Max auto-issues per day */
  maxAutoIssuesPerDay: number;
}

/**
 * Workflow E: Working Groups configuration.
 */
export interface WorkflowEConfig {
  /** Default charter duration */
  defaultCharterDuration: '6m' | '1y' | 'indefinite';
  /** Require dual approval for formation */
  requireDualApprovalForFormation: boolean;
}

/**
 * Complete workflow configurations.
 */
export interface WorkflowConfigs {
  workflowA: WorkflowAConfig;
  workflowB: WorkflowBConfig;
  workflowC: WorkflowCConfig;
  workflowD: WorkflowDConfig;
  workflowE: WorkflowEConfig;
}

/**
 * Default workflow configurations.
 */
export const DEFAULT_WORKFLOW_CONFIGS: WorkflowConfigs = {
  workflowA: {
    sources: ['arxiv', 'conferences', 'ai_labs'],
    digestFrequency: 'weekly',
    autoPublishDigests: true,
  },
  workflowB: {
    minAgents: 3,
    debateTimeoutHours: 48,
    requireConsensusForDP: false,
  },
  workflowC: {
    grantThresholds: {
      singleHouse: 1000,
      dualHouse: 5000,
      director3: 10000,
    },
    enableRetroactiveRewards: true,
  },
  workflowD: {
    enableAlwaysOn: true,
    scanIntervalHours: 1,
    significanceThreshold: 70,
    maxAutoIssuesPerDay: 10,
  },
  workflowE: {
    defaultCharterDuration: '1y',
    requireDualApprovalForFormation: true,
  },
};

// ============================================
// Document-Workflow Mapping
// ============================================

/**
 * Maps workflow types to their output documents.
 * Note: Workflow A uses DR for research digests and AR for assessments
 */
export const WORKFLOW_DOCUMENT_OUTPUTS: Record<string, DocumentType[]> = {
  A: ['DR', 'AR'],  // Disclosure Report (for research), Audit Report (for assessment)
  B: ['DP'],        // Decision Packet (optional)
  C: ['DGP', 'DG', 'MR', 'RR'],  // Grant Proposal, Grant, Milestone, Retroactive
  D: ['PP', 'PA', 'ER'],  // Partnership Proposal, Agreement, Ecosystem Report
  E: ['WGC', 'WGR'],  // Working Group Charter, Report
};

/**
 * Document types that require dual-house approval.
 */
export const DUAL_APPROVAL_DOCUMENTS: DocumentType[] = [
  'GP',   // Governance Proposal
  'DG',   // Developer Grant
  'PA',   // Partnership Agreement
  'WGC',  // Working Group Charter
];

/**
 * Document types that require Director 3 for HIGH risk.
 */
export const DIRECTOR3_REQUIRED_DOCUMENTS: DocumentType[] = [
  'PA',   // Partnership Agreement
  'DG',   // Developer Grant (above threshold)
];

// ============================================
// Risk-Action Mapping
// ============================================

/**
 * Action categories and their default risk levels.
 */
export const ACTION_RISK_LEVELS: Record<string, RiskLevel> = {
  // LOW risk - auto-approve after timeout
  publish_research_digest: 'LOW',
  publish_technology_assessment: 'LOW',
  update_working_group_report: 'LOW',
  agent_chatter: 'LOW',

  // MID risk - recommended review
  create_governance_proposal: 'MID',
  create_partnership_proposal: 'MID',
  form_working_group: 'MID',
  grant_under_threshold: 'MID',

  // HIGH risk - required approval, LOCKED
  execute_fund_transfer: 'HIGH',
  execute_contract_deployment: 'HIGH',
  execute_partnership_agreement: 'HIGH',
  execute_treasury_allocation: 'HIGH',
  execute_token_operation: 'HIGH',
  execute_protocol_upgrade: 'HIGH',
  grant_over_threshold: 'HIGH',
};

// ============================================
// Model Routing for Workflows
// ============================================

/**
 * Maps specialist types to difficulty levels.
 */
export const SPECIALIST_DIFFICULTY_MAPPING: Record<SpecialistCode, DifficultyLevel> = {
  RES: 'moderate',   // Researcher
  ANA: 'moderate',   // Analyst
  DRA: 'complex',    // Drafter
  REV: 'moderate',   // Reviewer
  RED: 'complex',    // Red Team
  SUM: 'simple',     // Summarizer
  TRN: 'simple',     // Translator
  ARC: 'simple',     // Archivist
};

/**
 * Document types and their required difficulty for generation.
 */
export const DOCUMENT_DIFFICULTY_MAPPING: Record<DocumentType, DifficultyLevel> = {
  // Decision documents
  DP: 'critical',    // Decision Packet - highest stakes
  GP: 'complex',     // Governance Proposal
  RM: 'moderate',    // Resolution Memo
  RC: 'complex',     // Reconciliation Memo

  // Working group
  WGC: 'complex',    // Charter
  WGR: 'moderate',   // Report

  // Ecosystem
  ER: 'moderate',    // Ecosystem Report
  PP: 'complex',     // Partnership Proposal
  PA: 'critical',    // Partnership Agreement - binding

  // Developer
  DGP: 'moderate',   // Grant Proposal
  DG: 'complex',     // Developer Grant
  MR: 'simple',      // Milestone Report
  RR: 'moderate',    // Retroactive Reward

  // Transparency
  DR: 'simple',      // Disclosure Report
  AR: 'moderate',    // Audit Report
};

// ============================================
// Event Types
// ============================================

/**
 * Governance OS events.
 */
export interface GovernanceOSEvents {
  // Pipeline events
  'pipeline:started': { context: PipelineContext };
  'pipeline:stage_completed': { context: PipelineContext; stage: PipelineStage };
  'pipeline:completed': { result: PipelineResult };
  'pipeline:error': { context: PipelineContext; error: Error };

  // Integration events
  'workflow:document_produced': { workflowId: string; documentId: string };
  'workflow:requires_approval': { workflowId: string; riskLevel: RiskLevel };
  'approval:routed': { actionId: string; routedTo: string };
  'approval:received': { actionId: string; approver: string };
  'execution:locked': { actionId: string; reason: string };
  'execution:unlocked': { actionId: string };
  'execution:completed': { actionId: string; result: unknown };

  // Health events
  'system:health_check': { healthy: boolean; components: Record<string, boolean> };
  'system:budget_warning': { usedUsd: number; budgetUsd: number };
}

// ============================================
// Statistics Types
// ============================================

/**
 * Governance OS statistics.
 */
export interface GovernanceOSStats {
  /** System uptime */
  uptimeHours: number;
  /** Total pipelines processed */
  totalPipelines: number;
  /** Successful pipelines */
  successfulPipelines: number;
  /** Failed pipelines */
  failedPipelines: number;
  /** Pending approvals */
  pendingApprovals: number;
  /** Locked actions */
  lockedActions: number;
  /** Documents produced */
  documentsProduced: number;
  /** Voting sessions */
  votingSessions: number;
  /** Reconciliations triggered */
  reconciliationsTriggered: number;
  /** LLM cost USD today */
  llmCostTodayUsd: number;
  /** LLM tokens today */
  llmTokensToday: number;
}
