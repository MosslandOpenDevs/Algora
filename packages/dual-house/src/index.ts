// ===========================================
// Dual-House Governance System for Algora v2.0
// ===========================================
//
// This package implements the dual-house governance model where:
// - MossCoin House: Token holders with token-weighted voting
// - OpenSource House: Contributors with contribution-weighted voting
//
// Key features:
// - Dual approval required for most decisions
// - Reconciliation process when houses disagree
// - Director 3 conflict resolution
// - High-risk action LOCK/UNLOCK mechanism
// - Vote delegation support
//

// ============================================
// Type Exports
// ============================================

export type {
  // House Types
  HouseType,
  HouseConfig,
  HouseMember,
  MossCoinMember,
  OpenSourceMember,
  HouseStats,

  // Vote Types
  VoteChoice,
  Vote,
  HouseVoteTally,

  // Dual-House Voting
  DualHouseStatus,
  DualHouseVoting,
  VotingPeriodConfig,

  // Reconciliation Types
  ReconciliationRecommendation,
  ConflictSummary,
  OrchestratorAnalysis,
  Director3DecisionType,
  Director3Decision,
  ReconciliationMemo,

  // High-Risk Types
  HighRiskApprovals,
  HighRiskApproval,

  // Delegation Types
  VoteDelegation,

  // Event Types
  DualHouseEvents,

  // Configuration
  DualHouseConfig,
  DualHouseStats,
} from './types.js';

// Export constants
export {
  HOUSE_DESCRIPTIONS,
  MOSSCOIN_HOUSE_CONFIG,
  OPENSOURCE_HOUSE_CONFIG,
  DEFAULT_VOTING_PERIOD,
  DEFAULT_DUAL_HOUSE_CONFIG,
} from './types.js';

// ============================================
// House Management Exports
// ============================================

export type {
  HouseStorage,
  ListMembersOptions,
  HouseManagerEvents,
  HouseManagerConfig,
} from './houses.js';

export {
  InMemoryHouseStorage,
  HouseManager,
  createHouseManager,
  createHouseManagerWithStorage,
} from './houses.js';

// ============================================
// Voting System Exports
// ============================================

export type {
  VotingStorage,
  ListVotingsOptions,
  VotingManagerEvents,
  VotingManagerConfig,
} from './voting.js';

export {
  InMemoryVotingStorage,
  DualHouseVotingManager,
  createVotingManager,
  createVotingManagerWithStorage,
} from './voting.js';

// ============================================
// Reconciliation Exports
// ============================================

export type {
  ReconciliationStorage,
  ListMemosOptions,
  ReconciliationManagerEvents,
  ReconciliationManagerConfig,
} from './reconciliation.js';

export {
  InMemoryReconciliationStorage,
  ReconciliationManager,
  createReconciliationManager,
  createReconciliationManagerWithStorage,
} from './reconciliation.js';

// ============================================
// High-Risk Approval Exports
// ============================================

export type {
  HighRiskApprovalStorage,
  ListApprovalsOptions,
  HighRiskApprovalManagerEvents,
  HighRiskApprovalManagerConfig,
  ExecutionHandler,
} from './high-risk-approval.js';

export {
  InMemoryHighRiskApprovalStorage,
  HighRiskApprovalManager,
  createHighRiskApprovalManager,
  createHighRiskApprovalManagerWithStorage,
} from './high-risk-approval.js';

// ============================================
// Unified Dual-House Governance System
// ============================================

// Import classes and factory functions for use in this file
import {
  HouseManager,
  createHouseManager,
  createHouseManagerWithStorage,
} from './houses.js';

import type { HouseManagerConfig, HouseStorage } from './houses.js';

import {
  DualHouseVotingManager,
  createVotingManager,
  createVotingManagerWithStorage,
} from './voting.js';

import type { VotingManagerConfig, VotingStorage } from './voting.js';

import {
  ReconciliationManager,
  createReconciliationManager,
  createReconciliationManagerWithStorage,
} from './reconciliation.js';

import type { ReconciliationManagerConfig, ReconciliationStorage } from './reconciliation.js';

import {
  HighRiskApprovalManager,
  createHighRiskApprovalManager,
  createHighRiskApprovalManagerWithStorage,
} from './high-risk-approval.js';

import type { HighRiskApprovalManagerConfig, HighRiskApprovalStorage } from './high-risk-approval.js';

import type { HouseType, DualHouseVoting, ReconciliationMemo, HighRiskApproval } from './types.js';

/**
 * Configuration for creating a complete dual-house governance system.
 */
export interface DualHouseGovernanceConfig {
  houseConfig?: HouseManagerConfig;
  votingConfig?: VotingManagerConfig;
  reconciliationConfig?: ReconciliationManagerConfig;
  highRiskConfig?: HighRiskApprovalManagerConfig;
}

/**
 * Complete dual-house governance system.
 */
export interface DualHouseGovernanceSystem {
  houses: HouseManager;
  voting: DualHouseVotingManager;
  reconciliation: ReconciliationManager;
  highRisk: HighRiskApprovalManager;
}

/**
 * Create a complete dual-house governance system with in-memory storage.
 * Ideal for development and testing.
 */
export function createDualHouseGovernance(
  config?: DualHouseGovernanceConfig
): DualHouseGovernanceSystem {
  // Create house manager first
  const houses = createHouseManager(config?.houseConfig);

  // Create voting manager with house manager
  const voting = createVotingManager(houses, config?.votingConfig);

  // Create reconciliation manager with voting manager
  const reconciliation = createReconciliationManager(voting, config?.reconciliationConfig);

  // Create high-risk approval manager with voting manager
  const highRisk = createHighRiskApprovalManager(voting, config?.highRiskConfig);

  // Wire up events
  setupEventWiring(houses, voting, reconciliation, highRisk);

  return {
    houses,
    voting,
    reconciliation,
    highRisk,
  };
}

/**
 * Set up event wiring between components.
 */
function setupEventWiring(
  houses: HouseManager,
  voting: DualHouseVotingManager,
  reconciliation: ReconciliationManager,
  highRisk: HighRiskApprovalManager
): void {
  // When voting is finalized, check for reconciliation need
  voting.on('voting:finalized', async (data: { voting: DualHouseVoting }) => {
    const v = data.voting;
    if (v.requiresReconciliation) {
      const conflictSummary = reconciliation.generateConflictSummary(v);
      await reconciliation.triggerReconciliation(v.id, conflictSummary);
    }

    // For HIGH-risk, create approval if both houses passed
    if (v.riskLevel === 'HIGH' && v.mossCoinHouse.passed && v.openSourceHouse.passed) {
      await highRisk.createApprovalFromVoting(v);
    }
  });

  // Track member power updates
  houses.on('power:updated', (data: { house: HouseType; memberId: string; newPower: number }) => {
    console.log(`[DualHouse] ${data.house} member ${data.memberId} power updated to ${data.newPower}`);
  });

  // Log reconciliation events
  reconciliation.on('reconciliation:triggered', (data: { votingId: string; memo: ReconciliationMemo }) => {
    console.log(`[DualHouse] Reconciliation triggered for voting ${data.votingId}, memo: ${data.memo.documentId}`);
  });

  reconciliation.on('reconciliation:director3_required', (data: { memoId: string }) => {
    console.log(`[DualHouse] Director 3 decision required for memo ${data.memoId}`);
  });

  // Log high-risk events
  highRisk.on('highrisk:created', (data: { approval: HighRiskApproval }) => {
    console.log(`[DualHouse] High-risk approval created: ${data.approval.id} for ${data.approval.actionType}`);
  });

  highRisk.on('highrisk:unlocked', (data: { approvalId: string }) => {
    console.log(`[DualHouse] High-risk approval ${data.approvalId} UNLOCKED`);
  });

  highRisk.on('highrisk:executed', (data: { approvalId: string }) => {
    console.log(`[DualHouse] High-risk action ${data.approvalId} EXECUTED`);
  });
}

/**
 * Create custom storage implementations for production use.
 */
export interface DualHouseStorageImplementations {
  houseStorage: HouseStorage;
  votingStorage: VotingStorage;
  reconciliationStorage: ReconciliationStorage;
  highRiskStorage: HighRiskApprovalStorage;
}

/**
 * Create a complete dual-house governance system with custom storage.
 * Use this for production with database-backed storage.
 */
export function createDualHouseGovernanceWithStorage(
  storage: DualHouseStorageImplementations,
  config?: DualHouseGovernanceConfig
): DualHouseGovernanceSystem {
  // Create managers with custom storage
  const houses = createHouseManagerWithStorage(storage.houseStorage, config?.houseConfig);
  const voting = createVotingManagerWithStorage(storage.votingStorage, houses, config?.votingConfig);
  const reconciliation = createReconciliationManagerWithStorage(
    storage.reconciliationStorage,
    voting,
    config?.reconciliationConfig
  );
  const highRisk = createHighRiskApprovalManagerWithStorage(
    storage.highRiskStorage,
    voting,
    config?.highRiskConfig
  );

  // Wire up events
  setupEventWiring(houses, voting, reconciliation, highRisk);

  return {
    houses,
    voting,
    reconciliation,
    highRisk,
  };
}

// ============================================
// Version Info
// ============================================

export const VERSION = '0.1.0';
export const PACKAGE_NAME = '@algora/dual-house';
