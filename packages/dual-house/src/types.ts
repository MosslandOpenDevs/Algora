// ===========================================
// Dual-House Governance Types for Algora v2.0
// ===========================================

// ============================================
// House Types
// ============================================

/**
 * House identifiers.
 */
export type HouseType = 'mosscoin' | 'opensource';

/**
 * House descriptions.
 */
export const HOUSE_DESCRIPTIONS: Record<HouseType, string> = {
  mosscoin: 'MossCoin House - MOC token holders with token-weighted voting',
  opensource: 'OpenSource House - Active contributors with contribution-weighted voting',
};

/**
 * Base house configuration.
 */
export interface HouseConfig {
  /** House identifier */
  type: HouseType;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Quorum percentage required (0-100) */
  quorumPercentage: number;
  /** Pass threshold percentage (0-100) */
  passThreshold: number;
  /** Focus areas for this house */
  focusAreas: string[];
  /** Voting weight calculation method */
  weightMethod: 'token' | 'contribution' | 'equal';
}

/**
 * Default MossCoin House configuration.
 */
export const MOSSCOIN_HOUSE_CONFIG: HouseConfig = {
  type: 'mosscoin',
  name: 'MossCoin House',
  description: 'MOC token holders with token-weighted voting power',
  quorumPercentage: 10,
  passThreshold: 50,
  focusAreas: ['treasury', 'tokenomics', 'financial', 'partnerships'],
  weightMethod: 'token',
};

/**
 * Default OpenSource House configuration.
 */
export const OPENSOURCE_HOUSE_CONFIG: HouseConfig = {
  type: 'opensource',
  name: 'Mossland OpenSource House',
  description: 'Active contributors with contribution-weighted voting power',
  quorumPercentage: 20,
  passThreshold: 50,
  focusAreas: ['technical', 'roadmap', 'development', 'architecture'],
  weightMethod: 'contribution',
};

// ============================================
// Member Types
// ============================================

/**
 * House member base interface.
 */
export interface HouseMember {
  /** Unique member identifier */
  id: string;
  /** Display name */
  name?: string;
  /** Wallet address (for MossCoin house) */
  walletAddress?: string;
  /** GitHub username (for OpenSource house) */
  githubUsername?: string;
  /** Member's voting weight */
  votingPower: number;
  /** When member joined */
  joinedAt: Date;
  /** Last activity timestamp */
  lastActiveAt?: Date;
  /** Member status */
  status: 'active' | 'inactive' | 'suspended';
}

/**
 * MossCoin House member.
 */
export interface MossCoinMember extends HouseMember {
  /** MOC token balance */
  tokenBalance: number;
  /** Delegated voting power received */
  delegatedPower: number;
  /** Whether member has delegated their vote */
  hasDelegated: boolean;
  /** Delegate address if delegated */
  delegateTo?: string;
}

/**
 * OpenSource House member.
 */
export interface OpenSourceMember extends HouseMember {
  /** Contribution score */
  contributionScore: number;
  /** Number of commits */
  commits: number;
  /** Number of pull requests */
  pullRequests: number;
  /** Community points */
  communityPoints: number;
  /** Roles in the community */
  roles: string[];
}

// ============================================
// Vote Types
// ============================================

/**
 * Vote options.
 */
export type VoteChoice = 'for' | 'against' | 'abstain';

/**
 * A vote cast by a member.
 */
export interface Vote {
  /** Vote ID */
  id: string;
  /** Voting session ID */
  votingId: string;
  /** House this vote is for */
  house: HouseType;
  /** Member who cast the vote */
  memberId: string;
  /** Vote choice */
  choice: VoteChoice;
  /** Voting power used */
  votingPower: number;
  /** Optional comment */
  comment?: string;
  /** When vote was cast */
  timestamp: Date;
  /** Signature for verification */
  signature?: string;
}

/**
 * Vote tally for a house.
 */
export interface HouseVoteTally {
  /** House type */
  house: HouseType;
  /** Votes for */
  votesFor: number;
  /** Votes against */
  votesAgainst: number;
  /** Votes abstain */
  votesAbstain: number;
  /** Total votes cast */
  totalVotes: number;
  /** Total possible voting power */
  totalPossiblePower: number;
  /** Participation rate (0-100) */
  participationRate: number;
  /** Whether quorum was reached */
  quorumReached: boolean;
  /** Whether proposal passed in this house */
  passed: boolean;
}

// ============================================
// Dual-House Voting
// ============================================

/**
 * Overall voting status.
 */
export type DualHouseStatus =
  | 'pending'
  | 'voting'
  | 'both_passed'
  | 'moc_only'
  | 'oss_only'
  | 'rejected'
  | 'reconciliation'
  | 'executed'
  | 'vetoed';

/**
 * Dual-house voting session.
 */
export interface DualHouseVoting {
  /** Voting session ID */
  id: string;
  /** Related proposal ID */
  proposalId: string;
  /** Proposal title */
  title: string;
  /** Proposal summary */
  summary: string;
  /** Risk level */
  riskLevel: 'LOW' | 'MID' | 'HIGH';
  /** Category for routing */
  category: string;
  /** MossCoin House tally */
  mossCoinHouse: HouseVoteTally;
  /** OpenSource House tally */
  openSourceHouse: HouseVoteTally;
  /** Overall status */
  status: DualHouseStatus;
  /** Whether reconciliation is required */
  requiresReconciliation: boolean;
  /** Reconciliation memo ID if exists */
  reconciliationMemoId?: string;
  /** Director 3 decision if made */
  director3Decision?: Director3Decision;
  /** Voting start time */
  startedAt: Date;
  /** Voting end time */
  endsAt: Date;
  /** When finalized */
  finalizedAt?: Date;
  /** Created by */
  createdBy: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Voting period configuration.
 */
export interface VotingPeriodConfig {
  /** Duration in hours */
  durationHours: number;
  /** Minimum voting period in hours */
  minDurationHours: number;
  /** Maximum voting period in hours */
  maxDurationHours: number;
  /** Whether early finalization is allowed */
  allowEarlyFinalization: boolean;
  /** Quorum required for early finalization */
  earlyFinalizationQuorum: number;
}

/**
 * Default voting period configuration.
 */
export const DEFAULT_VOTING_PERIOD: VotingPeriodConfig = {
  durationHours: 72,
  minDurationHours: 24,
  maxDurationHours: 168,
  allowEarlyFinalization: true,
  earlyFinalizationQuorum: 75,
};

// ============================================
// Reconciliation Types
// ============================================

/**
 * Reconciliation recommendation.
 */
export type ReconciliationRecommendation =
  | 'favor_moc'
  | 'favor_oss'
  | 'compromise'
  | 'reject_both';

/**
 * Conflict summary in reconciliation.
 */
export interface ConflictSummary {
  /** MossCoin House position */
  mossCoinPosition: string;
  /** OpenSource House position */
  openSourcePosition: string;
  /** Key disagreements */
  keyDisagreements: string[];
  /** Areas of agreement */
  areasOfAgreement?: string[];
}

/**
 * Orchestrator's analysis for reconciliation.
 */
export interface OrchestratorAnalysis {
  /** Underlying concerns identified */
  underlyingConcerns: string[];
  /** Possible compromises */
  possibleCompromises: string[];
  /** Recommendation */
  recommendation: ReconciliationRecommendation;
  /** Reasoning for recommendation */
  reasoning: string;
  /** Confidence score (0-100) */
  confidence: number;
}

/**
 * Director 3 decision types.
 */
export type Director3DecisionType =
  | 'override_moc'
  | 'override_oss'
  | 'revote'
  | 'veto'
  | 'approve_with_conditions';

/**
 * Director 3 decision.
 */
export interface Director3Decision {
  /** Decision type */
  decision: Director3DecisionType;
  /** Reasoning */
  reasoning: string;
  /** Conditions for approval (if applicable) */
  conditions?: string[];
  /** Decision timestamp */
  timestamp: Date;
  /** Director 3 identifier */
  director3Id: string;
  /** Signature */
  signature?: string;
}

/**
 * Reconciliation memo.
 */
export interface ReconciliationMemo {
  /** Memo ID */
  id: string;
  /** Document ID (RC-YYYYMMDD-NNN format) */
  documentId: string;
  /** Related proposal ID */
  proposalId: string;
  /** Related voting session ID */
  votingId: string;
  /** Conflict summary */
  conflictSummary: ConflictSummary;
  /** Orchestrator's analysis */
  orchestratorAnalysis: OrchestratorAnalysis;
  /** Director 3 decision if made */
  director3Decision?: Director3Decision;
  /** Status */
  status: 'pending' | 'awaiting_director3' | 'resolved' | 'expired';
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Resolution timestamp */
  resolvedAt?: Date;
  /** Expiration timestamp */
  expiresAt: Date;
}

// ============================================
// High-Risk Approval Types
// ============================================

/**
 * Required approvals for high-risk actions.
 */
export interface HighRiskApprovals {
  /** MossCoin House approved */
  mossCoinHouse: boolean;
  /** OpenSource House approved */
  openSourceHouse: boolean;
  /** Director 3 approved */
  director3: boolean;
}

/**
 * High-risk approval record.
 */
export interface HighRiskApproval {
  /** Approval ID */
  id: string;
  /** Related proposal ID */
  proposalId: string;
  /** Related voting session ID */
  votingId: string;
  /** Risk level (always HIGH for this type) */
  riskLevel: 'HIGH';
  /** Action description */
  actionDescription: string;
  /** Action type */
  actionType: string;
  /** Approvals received */
  approvals: HighRiskApprovals;
  /** Lock status */
  lockStatus: 'LOCKED' | 'UNLOCKED';
  /** Execution payload */
  executionPayload?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Unlocked timestamp */
  unlockedAt?: Date;
  /** Executed timestamp */
  executedAt?: Date;
}

// ============================================
// Delegation Types
// ============================================

/**
 * Vote delegation.
 */
export interface VoteDelegation {
  /** Delegation ID */
  id: string;
  /** House type */
  house: HouseType;
  /** Delegator (who is delegating) */
  delegatorId: string;
  /** Delegate (who receives the power) */
  delegateId: string;
  /** Voting power delegated */
  votingPower: number;
  /** Delegation scope */
  scope: 'all' | 'category' | 'proposal';
  /** Category if scope is 'category' */
  category?: string;
  /** Proposal ID if scope is 'proposal' */
  proposalId?: string;
  /** Whether delegation is active */
  active: boolean;
  /** Created timestamp */
  createdAt: Date;
  /** Expires timestamp */
  expiresAt?: Date;
  /** Revoked timestamp */
  revokedAt?: Date;
}

// ============================================
// Events
// ============================================

/**
 * Dual-house governance events.
 */
export interface DualHouseEvents {
  // Voting events
  'voting:created': { voting: DualHouseVoting };
  'voting:started': { votingId: string };
  'voting:vote_cast': { vote: Vote };
  'voting:quorum_reached': { votingId: string; house: HouseType };
  'voting:finalized': { voting: DualHouseVoting };

  // Reconciliation events
  'reconciliation:triggered': { votingId: string; memo: ReconciliationMemo };
  'reconciliation:director3_required': { memoId: string };
  'reconciliation:resolved': { memoId: string; decision: Director3Decision };
  'reconciliation:expired': { memoId: string };

  // High-risk events
  'highrisk:created': { approval: HighRiskApproval };
  'highrisk:house_approved': { approvalId: string; house: HouseType };
  'highrisk:director3_approved': { approvalId: string };
  'highrisk:unlocked': { approvalId: string };
  'highrisk:executed': { approvalId: string };

  // Delegation events
  'delegation:created': { delegation: VoteDelegation };
  'delegation:revoked': { delegationId: string };
  'delegation:expired': { delegationId: string };

  // Member events
  'member:joined': { house: HouseType; memberId: string };
  'member:left': { house: HouseType; memberId: string };
  'member:power_updated': { house: HouseType; memberId: string; newPower: number };
}

// ============================================
// Configuration
// ============================================

/**
 * Dual-house governance configuration.
 */
export interface DualHouseConfig {
  /** MossCoin House configuration */
  mossCoinHouse: HouseConfig;
  /** OpenSource House configuration */
  openSourceHouse: HouseConfig;
  /** Voting period configuration */
  votingPeriod: VotingPeriodConfig;
  /** Reconciliation timeout in hours */
  reconciliationTimeoutHours: number;
  /** Whether Director 3 approval is required for HIGH-risk */
  requireDirector3ForHighRisk: boolean;
  /** Director 3 IDs (who can make Director 3 decisions) */
  director3Ids: string[];
  /** Categories that require both houses */
  dualApprovalCategories: string[];
  /** Categories that only need MossCoin House */
  mossCoinOnlyCategories: string[];
  /** Categories that only need OpenSource House */
  openSourceOnlyCategories: string[];
}

/**
 * Default dual-house configuration.
 */
export const DEFAULT_DUAL_HOUSE_CONFIG: DualHouseConfig = {
  mossCoinHouse: MOSSCOIN_HOUSE_CONFIG,
  openSourceHouse: OPENSOURCE_HOUSE_CONFIG,
  votingPeriod: DEFAULT_VOTING_PERIOD,
  reconciliationTimeoutHours: 72,
  requireDirector3ForHighRisk: true,
  director3Ids: [],
  dualApprovalCategories: [
    'treasury',
    'partnership',
    'tokenomics',
    'governance',
    'security',
  ],
  mossCoinOnlyCategories: [
    'token_burn',
    'token_mint',
    'treasury_allocation',
  ],
  openSourceOnlyCategories: [
    'code_release',
    'technical_upgrade',
    'dependency_update',
  ],
};

// ============================================
// Statistics
// ============================================

/**
 * House statistics.
 */
export interface HouseStats {
  /** House type */
  house: HouseType;
  /** Total members */
  totalMembers: number;
  /** Active members (voted in last 30 days) */
  activeMembers: number;
  /** Total voting power */
  totalVotingPower: number;
  /** Average participation rate */
  averageParticipation: number;
  /** Total votes cast */
  totalVotesCast: number;
  /** Proposals passed */
  proposalsPassed: number;
  /** Proposals rejected */
  proposalsRejected: number;
}

/**
 * Dual-house governance statistics.
 */
export interface DualHouseStats {
  /** MossCoin House stats */
  mossCoinHouse: HouseStats;
  /** OpenSource House stats */
  openSourceHouse: HouseStats;
  /** Total voting sessions */
  totalVotingSessions: number;
  /** Sessions where both passed */
  bothPassedCount: number;
  /** Sessions requiring reconciliation */
  reconciliationCount: number;
  /** Reconciliation success rate */
  reconciliationSuccessRate: number;
  /** High-risk approvals processed */
  highRiskApprovalsProcessed: number;
  /** Average voting duration in hours */
  averageVotingDurationHours: number;
}
