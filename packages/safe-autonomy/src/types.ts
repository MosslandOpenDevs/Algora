// ===========================================
// Safe Autonomy Types for Algora v2.0
// ===========================================

// ============================================
// Risk Classification Types
// ============================================

/**
 * Risk levels for actions in the governance system.
 * - LOW: Auto-approve after 24h, recommended review
 * - MID: Auto-approve after 48h with "Unreviewed" label
 * - HIGH: Required review, remains LOCKED until approved
 */
export type RiskLevel = 'LOW' | 'MID' | 'HIGH';

/**
 * Action types that the system can perform.
 * Each action type maps to a specific risk level.
 */
export type ActionType =
  // HIGH-risk actions (always LOCKED)
  | 'FUND_TRANSFER'
  | 'CONTRACT_DEPLOY'
  | 'PARTNERSHIP_COMMIT'
  | 'EXTERNAL_COMMUNICATION'
  // MID-risk actions
  | 'PROPOSAL_CREATE'
  | 'WORKING_GROUP_CREATE'
  | 'GRANT_PROPOSAL'
  | 'MILESTONE_REPORT'
  // LOW-risk actions
  | 'DOCUMENT_PUBLISH'
  | 'RESEARCH_DIGEST'
  | 'AGENT_CHATTER'
  | 'SIGNAL_PROCESS';

/**
 * Risk penalty factors used in priority scoring.
 */
export interface RiskPenalty {
  securityRisk: 0 | -10 | -20 | -30;
  complianceRisk: 0 | -10 | -20 | -30;
  reputationalRisk: 0 | -5 | -10 | -20;
  reversibilityRisk: 0 | -5 | -10 | -20;
}

/**
 * Classification result from the risk classifier.
 */
export interface RiskClassification {
  actionType: ActionType;
  riskLevel: RiskLevel;
  riskPenalty: RiskPenalty;
  totalPenalty: number;
  shouldLock: boolean;
  reason: string;
}

// ============================================
// Lock Management Types
// ============================================

/**
 * Status of a locked action.
 */
export type LockStatus =
  | 'LOCKED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'EXPIRED';

/**
 * A locked action waiting for approval.
 */
export interface LockedAction {
  id: string;
  documentId?: string;
  actionType: ActionType;
  riskLevel: RiskLevel;
  lockReason: string;
  lockedAt: Date;
  lockedBy: string;

  // Approval tracking
  requiredApprovals: ApprovalRequirement[];
  receivedApprovals: ApprovalRecord[];

  // Execution context
  executionPayload: Record<string, unknown>;

  // Status
  status: LockStatus;
  unlockedAt?: Date;
  unlockedBy?: string;
  executedAt?: Date;

  // Timeouts
  timeoutAt: Date;
  remindersSent: number;
}

/**
 * Requirement for approval.
 */
export interface ApprovalRequirement {
  approverType: 'director_3' | 'moc_house' | 'oss_house' | 'any_reviewer';
  required: boolean;
  minCount?: number;
}

/**
 * Record of an approval action.
 */
export interface ApprovalRecord {
  id: string;
  lockedActionId: string;
  reviewerId: string;
  reviewerType: 'human' | 'agent';
  reviewerRole?: string;
  action: 'approve' | 'reject' | 'request_changes' | 'escalate';
  timestamp: Date;
  comments?: string;
  signature?: string;
}

/**
 * Result of attempting to unlock an action.
 */
export interface UnlockResult {
  success: boolean;
  lockedAction: LockedAction;
  canExecute: boolean;
  missingApprovals: ApprovalRequirement[];
  reason?: string;
}

// ============================================
// Approval Routing Types
// ============================================

/**
 * Policy for routing reviews.
 */
export interface RoutingPolicy {
  riskLevel: RiskLevel;
  routeTo: 'auto' | 'any_reviewer' | 'director_3';
  reviewRequired: boolean;
  timeoutAction: 'auto_approve' | 'escalate' | 'reject';
  timeoutHours: number;
}

/**
 * A pending review item.
 */
export interface PendingReview {
  id: string;
  lockedActionId: string;
  documentId?: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  routedTo: string[];
  createdAt: Date;
  dueAt: Date;
  status: 'pending' | 'in_review' | 'completed';
  priority: number;
}

/**
 * Result of routing a review.
 */
export interface RoutingResult {
  pendingReview: PendingReview;
  notifiedReviewers: string[];
  nextReminderAt: Date;
}

// ============================================
// Passive Consensus Types
// ============================================

/**
 * Status of passive consensus on an item.
 */
export type PassiveConsensusStatus =
  | 'PENDING'
  | 'APPROVED_BY_TIMEOUT'
  | 'VETOED'
  | 'ESCALATED'
  | 'EXPLICITLY_APPROVED';

/**
 * A passive consensus item.
 */
export interface PassiveConsensusItem {
  id: string;
  documentId: string;
  documentType: string;
  riskLevel: RiskLevel;
  status: PassiveConsensusStatus;
  createdAt: Date;
  reviewPeriodEndsAt: Date;
  unreviewedByHuman: boolean;
  vetoes: VetoRecord[];
  escalations: EscalationRecord[];
  autoApprovedAt?: Date;
}

/**
 * Record of a veto.
 */
export interface VetoRecord {
  id: string;
  vetoerId: string;
  vetoerType: 'human' | 'agent';
  reason: string;
  timestamp: Date;
}

/**
 * Record of an escalation.
 */
export interface EscalationRecord {
  id: string;
  escalatorId: string;
  escalatorType: 'human' | 'agent';
  reason: string;
  escalatedTo: string;
  timestamp: Date;
}

// ============================================
// Retry Handler Types
// ============================================

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Status of a retryable task.
 */
export type RetryStatus =
  | 'pending'
  | 'executing'
  | 'succeeded'
  | 'failed_retrying'
  | 'failed_exhausted'
  | 'escalated';

/**
 * A retryable task.
 */
export interface RetryableTask<T = unknown> {
  id: string;
  name: string;
  payload: T;
  status: RetryStatus;
  retryCount: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  createdAt: Date;
  completedAt?: Date;
  result?: unknown;
}

/**
 * Result of executing a retryable task.
 */
export interface RetryResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  escalated: boolean;
  finalStatus: RetryStatus;
}

// ============================================
// Audit Trail Types
// ============================================

/**
 * Actions that can be audited.
 */
export type AuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'STATE_CHANGED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'REJECTED'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'EXECUTED'
  | 'ESCALATED'
  | 'VETOED'
  | 'ACCESSED'
  | 'EXPORTED';

/**
 * An audit log entry.
 */
export interface AuditEntry {
  id: string;
  documentId?: string;
  lockedActionId?: string;
  action: AuditAction;
  actor: {
    id: string;
    type: 'agent' | 'human' | 'system';
    name?: string;
  };
  timestamp: Date;
  previousState?: string;
  newState?: string;
  contentHashBefore?: string;
  contentHashAfter?: string;
  metadata: Record<string, unknown>;
}

// ============================================
// Event Types for Real-time Updates
// ============================================

/**
 * Events emitted by the safe-autonomy system.
 */
export interface SafeAutonomyEvents {
  'action:locked': { lockedAction: LockedAction };
  'action:unlocked': { lockedAction: LockedAction; unlockedBy: string };
  'action:executed': { lockedAction: LockedAction; result: unknown };
  'action:rejected': { lockedAction: LockedAction; reason: string };
  'approval:received': { lockedActionId: string; approval: ApprovalRecord };
  'approval:required': { pendingReview: PendingReview };
  'consensus:timeout': { item: PassiveConsensusItem };
  'consensus:vetoed': { item: PassiveConsensusItem; veto: VetoRecord };
  'task:retry': { task: RetryableTask; attempt: number };
  'task:escalated': { task: RetryableTask; reason: string };
  'audit:entry': { entry: AuditEntry };
}

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for the Safe Autonomy system.
 */
export interface SafeAutonomyConfig {
  // Retry settings
  retry: RetryConfig;

  // Routing policies by risk level
  routingPolicies: RoutingPolicy[];

  // Passive consensus settings
  passiveConsensus: {
    enabled: boolean;
    defaultReviewPeriodHours: Record<RiskLevel, number>;
    reminderIntervalHours: number[];
  };

  // Director 3 settings
  director3: {
    userId: string;
    alwaysNotify: boolean;
    escalationTimeoutHours: number;
  };

  // Audit settings
  audit: {
    enabled: boolean;
    retentionDays: number;
  };
}

/**
 * Default configuration for Safe Autonomy.
 */
export const DEFAULT_SAFE_AUTONOMY_CONFIG: SafeAutonomyConfig = {
  retry: {
    maxRetries: 10,
    initialDelayMs: 1000,
    maxDelayMs: 3600000, // 1 hour
    backoffMultiplier: 2,
  },
  routingPolicies: [
    {
      riskLevel: 'LOW',
      routeTo: 'auto',
      reviewRequired: false,
      timeoutAction: 'auto_approve',
      timeoutHours: 24,
    },
    {
      riskLevel: 'MID',
      routeTo: 'any_reviewer',
      reviewRequired: false,
      timeoutAction: 'auto_approve',
      timeoutHours: 48,
    },
    {
      riskLevel: 'HIGH',
      routeTo: 'director_3',
      reviewRequired: true,
      timeoutAction: 'escalate',
      timeoutHours: 72,
    },
  ],
  passiveConsensus: {
    enabled: true,
    defaultReviewPeriodHours: {
      LOW: 24,
      MID: 48,
      HIGH: 72,
    },
    reminderIntervalHours: [24, 48, 72],
  },
  director3: {
    userId: 'director_3',
    alwaysNotify: true,
    escalationTimeoutHours: 72,
  },
  audit: {
    enabled: true,
    retentionDays: 365,
  },
};
