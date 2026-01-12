// ===========================================
// Safe Autonomy Package for Algora v2.0
// ===========================================
//
// This package implements the Safe Autonomy layer for Algora's
// autonomous governance system. It provides:
//
// 1. Risk Classification - Categorize actions by risk level
// 2. Lock Management - LOCK/UNLOCK dangerous actions
// 3. Approval Routing - Route reviews to appropriate reviewers
// 4. Passive Consensus - Opt-out approval model
// 5. Retry Handler - Delay-retry behavior for resilience
//
// Core Principles:
// - The system never stops operating
// - Dangerous effects are always LOCKED until approved
// - Transparency by default
// - Human override at any time
//
// ===========================================

// ============================================
// Type Exports
// ============================================

export type {
  // Risk Classification
  RiskLevel,
  ActionType,
  RiskPenalty,
  RiskClassification,

  // Lock Management
  LockStatus,
  LockedAction,
  ApprovalRequirement,
  ApprovalRecord,
  UnlockResult,

  // Approval Routing
  RoutingPolicy,
  PendingReview,
  RoutingResult,

  // Passive Consensus
  PassiveConsensusStatus,
  PassiveConsensusItem,
  VetoRecord,
  EscalationRecord,

  // Retry Handler
  RetryConfig,
  RetryStatus,
  RetryableTask,
  RetryResult,

  // Audit Trail
  AuditAction,
  AuditEntry,

  // Events
  SafeAutonomyEvents,

  // Configuration
  SafeAutonomyConfig,
} from './types.js';

export { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';

// ============================================
// Risk Classifier Exports
// ============================================

export {
  RiskClassifier,
  riskClassifier,
  classifyAction,
  isActionLocked,
  getActionRiskLevel,
  createRiskPenalty,
} from './risk-classifier.js';

// ============================================
// Lock Manager Exports
// ============================================

export type {
  CreateLockOptions,
  LockManagerEvents,
  LockStorage,
} from './lock-manager.js';

export {
  LockManager,
  InMemoryLockStorage,
  createLockManager,
} from './lock-manager.js';

// ============================================
// Approval Router Exports
// ============================================

export type {
  Reviewer,
  ReviewNotification,
  ApprovalRouterEvents,
  ReviewStorage,
} from './approval-router.js';

export {
  ApprovalRouter,
  ReviewerRegistry,
  InMemoryReviewStorage,
  createApprovalRouter,
  getDefaultRoutingPolicies,
} from './approval-router.js';

// ============================================
// Passive Consensus Exports
// ============================================

export type {
  CreateConsensusOptions,
  ConsensusCheckResult,
  PassiveConsensusEvents,
  ConsensusStorage,
} from './passive-consensus.js';

export {
  PassiveConsensusManager,
  InMemoryConsensusStorage,
  createPassiveConsensusManager,
  canAutoApprove,
} from './passive-consensus.js';

// ============================================
// Retry Handler Exports
// ============================================

export type {
  CreateTaskOptions,
  RetryableFunction,
  RetryHandlerEvents,
  TaskStorage,
} from './retry-handler.js';

export {
  RetryHandler,
  InMemoryTaskStorage,
  createRetryHandler,
  getDefaultRetryConfig,
  withRetry,
  isRetryableError,
  calculateBackoff,
} from './retry-handler.js';

// ============================================
// Convenience Factory
// ============================================

import { LockManager, InMemoryLockStorage } from './lock-manager.js';
import {
  ApprovalRouter,
  ReviewerRegistry,
  InMemoryReviewStorage,
} from './approval-router.js';
import {
  PassiveConsensusManager,
  InMemoryConsensusStorage,
} from './passive-consensus.js';
import { RetryHandler, InMemoryTaskStorage } from './retry-handler.js';
import type { SafeAutonomyConfig } from './types.js';
import { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';

/**
 * SafeAutonomySystem bundles all safe autonomy components together.
 */
export interface SafeAutonomySystem {
  lockManager: LockManager;
  approvalRouter: ApprovalRouter;
  passiveConsensus: PassiveConsensusManager;
  retryHandler: RetryHandler;
  config: SafeAutonomyConfig;
}

/**
 * Create a complete SafeAutonomySystem with all components.
 * Uses in-memory storage by default for development.
 */
export function createSafeAutonomySystem(
  config: SafeAutonomyConfig = DEFAULT_SAFE_AUTONOMY_CONFIG
): SafeAutonomySystem {
  const lockManager = new LockManager(new InMemoryLockStorage(), config);
  const reviewerRegistry = new ReviewerRegistry();
  const approvalRouter = new ApprovalRouter(
    new InMemoryReviewStorage(),
    reviewerRegistry,
    config
  );
  const passiveConsensus = new PassiveConsensusManager(
    new InMemoryConsensusStorage(),
    config
  );
  const retryHandler = new RetryHandler(
    new InMemoryTaskStorage(),
    config.retry
  );

  return {
    lockManager,
    approvalRouter,
    passiveConsensus,
    retryHandler,
    config,
  };
}

// ============================================
// Anti-Abuse Protection Exports
// ============================================

export type {
  AntiAbuseConfig,
  Signal as AntiAbuseSignal,
  ValidationResult,
  SignalHistory,
  RateLimitState,
} from './anti-abuse.js';

export {
  AntiAbuseGuard,
  DEFAULT_ANTI_ABUSE_CONFIG,
  getAntiAbuseGuard,
  createAntiAbuseGuard,
} from './anti-abuse.js';

// ============================================
// Version
// ============================================

export const SAFE_AUTONOMY_VERSION = '0.1.0';
