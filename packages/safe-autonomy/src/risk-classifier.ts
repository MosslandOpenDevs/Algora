// ===========================================
// Risk Classifier for Algora Safe Autonomy
// ===========================================

import type {
  ActionType,
  RiskLevel,
  RiskPenalty,
  RiskClassification,
} from './types.js';

// ============================================
// Risk Level Mapping
// ============================================

/**
 * Maps action types to their inherent risk levels.
 * HIGH-risk actions are always LOCKED.
 * MID-risk actions are recommended for review.
 * LOW-risk actions can auto-approve.
 */
const ACTION_RISK_MAP: Record<ActionType, RiskLevel> = {
  // HIGH-risk actions (always LOCKED)
  FUND_TRANSFER: 'HIGH',
  CONTRACT_DEPLOY: 'HIGH',
  PARTNERSHIP_COMMIT: 'HIGH',
  EXTERNAL_COMMUNICATION: 'HIGH',

  // MID-risk actions
  PROPOSAL_CREATE: 'MID',
  WORKING_GROUP_CREATE: 'MID',
  GRANT_PROPOSAL: 'MID',
  MILESTONE_REPORT: 'MID',

  // LOW-risk actions
  DOCUMENT_PUBLISH: 'LOW',
  RESEARCH_DIGEST: 'LOW',
  AGENT_CHATTER: 'LOW',
  SIGNAL_PROCESS: 'LOW',
};

/**
 * Descriptions of why each action type has its risk level.
 */
const RISK_REASONS: Record<ActionType, string> = {
  FUND_TRANSFER:
    'Fund transfers can result in irreversible financial loss',
  CONTRACT_DEPLOY:
    'Smart contract deployments are immutable and can have security implications',
  PARTNERSHIP_COMMIT:
    'Partnership commitments create binding obligations with external parties',
  EXTERNAL_COMMUNICATION:
    'External communications on behalf of Mossland can affect reputation',
  PROPOSAL_CREATE:
    'Proposals can lead to governance changes if approved',
  WORKING_GROUP_CREATE:
    'Working groups receive publishing authority and may have budgets',
  GRANT_PROPOSAL:
    'Grant proposals can result in fund allocation if approved',
  MILESTONE_REPORT:
    'Milestone reports can trigger fund disbursements',
  DOCUMENT_PUBLISH:
    'Published documents become part of the official record',
  RESEARCH_DIGEST:
    'Research digests are informational with no binding authority',
  AGENT_CHATTER:
    'Agent chatter is ambient activity with no governance authority',
  SIGNAL_PROCESS:
    'Signal processing is internal data handling',
};

// ============================================
// Risk Penalty Thresholds
// ============================================

/**
 * Total penalty threshold that triggers automatic LOCK.
 * If the sum of all risk penalties is <= -50, the action is LOCKED.
 */
const LOCK_PENALTY_THRESHOLD = -50;

// ============================================
// Risk Classifier Class
// ============================================

/**
 * RiskClassifier evaluates actions and determines their risk level,
 * penalties, and whether they should be LOCKED.
 */
export class RiskClassifier {
  /**
   * Get the base risk level for an action type.
   */
  getBaseRiskLevel(actionType: ActionType): RiskLevel {
    return ACTION_RISK_MAP[actionType];
  }

  /**
   * Calculate the total risk penalty from individual factors.
   */
  calculateTotalPenalty(penalty: RiskPenalty): number {
    return (
      penalty.securityRisk +
      penalty.complianceRisk +
      penalty.reputationalRisk +
      penalty.reversibilityRisk
    );
  }

  /**
   * Determine if an action should be LOCKED based on its penalty.
   */
  shouldLock(totalPenalty: number): boolean {
    return totalPenalty <= LOCK_PENALTY_THRESHOLD;
  }

  /**
   * Determine if an action should be LOCKED based on its risk level.
   * HIGH-risk actions are always LOCKED regardless of penalty.
   */
  shouldLockByRiskLevel(riskLevel: RiskLevel): boolean {
    return riskLevel === 'HIGH';
  }

  /**
   * Classify an action and determine its full risk profile.
   */
  classify(
    actionType: ActionType,
    penalty: RiskPenalty = {
      securityRisk: 0,
      complianceRisk: 0,
      reputationalRisk: 0,
      reversibilityRisk: 0,
    }
  ): RiskClassification {
    const riskLevel = this.getBaseRiskLevel(actionType);
    const totalPenalty = this.calculateTotalPenalty(penalty);
    const shouldLockByPenalty = this.shouldLock(totalPenalty);
    const shouldLockByLevel = this.shouldLockByRiskLevel(riskLevel);

    return {
      actionType,
      riskLevel,
      riskPenalty: penalty,
      totalPenalty,
      shouldLock: shouldLockByPenalty || shouldLockByLevel,
      reason: RISK_REASONS[actionType],
    };
  }

  /**
   * Quick check if an action type is HIGH-risk.
   */
  isHighRisk(actionType: ActionType): boolean {
    return ACTION_RISK_MAP[actionType] === 'HIGH';
  }

  /**
   * Get all HIGH-risk action types.
   */
  getHighRiskActions(): ActionType[] {
    return Object.entries(ACTION_RISK_MAP)
      .filter(([_, level]) => level === 'HIGH')
      .map(([type]) => type as ActionType);
  }

  /**
   * Validate that an action type is known.
   */
  isValidActionType(type: string): type is ActionType {
    return type in ACTION_RISK_MAP;
  }

  /**
   * Upgrade risk level if penalty threshold is exceeded.
   * LOW -> MID -> HIGH based on penalty severity.
   */
  getEffectiveRiskLevel(
    baseLevel: RiskLevel,
    totalPenalty: number
  ): RiskLevel {
    if (baseLevel === 'HIGH') return 'HIGH';
    if (totalPenalty <= LOCK_PENALTY_THRESHOLD) return 'HIGH';
    if (totalPenalty <= -30 && baseLevel === 'LOW') return 'MID';
    return baseLevel;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default risk classifier instance.
 */
export const riskClassifier = new RiskClassifier();

// ============================================
// Utility Functions
// ============================================

/**
 * Quick classification for a single action type.
 */
export function classifyAction(
  actionType: ActionType,
  penalty?: RiskPenalty
): RiskClassification {
  return riskClassifier.classify(actionType, penalty);
}

/**
 * Check if an action should be LOCKED.
 */
export function isActionLocked(
  actionType: ActionType,
  penalty?: RiskPenalty
): boolean {
  return riskClassifier.classify(actionType, penalty).shouldLock;
}

/**
 * Get the risk level for an action type.
 */
export function getActionRiskLevel(actionType: ActionType): RiskLevel {
  return riskClassifier.getBaseRiskLevel(actionType);
}

/**
 * Create a risk penalty object from individual values.
 */
export function createRiskPenalty(
  security: RiskPenalty['securityRisk'] = 0,
  compliance: RiskPenalty['complianceRisk'] = 0,
  reputational: RiskPenalty['reputationalRisk'] = 0,
  reversibility: RiskPenalty['reversibilityRisk'] = 0
): RiskPenalty {
  return {
    securityRisk: security,
    complianceRisk: compliance,
    reputationalRisk: reputational,
    reversibilityRisk: reversibility,
  };
}
