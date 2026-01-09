import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { OutcomeService } from './outcome';
import { TrustScoringService } from './trust-scoring';
import { AnalyticsService } from './analytics';

export class ProofOfOutcomeService {
  public readonly outcomes: OutcomeService;
  public readonly trustScoring: TrustScoringService;
  public readonly analytics: AnalyticsService;

  constructor(db: Database.Database, io: SocketServer) {
    this.outcomes = new OutcomeService(db, io);
    this.trustScoring = new TrustScoringService(db, io);
    this.analytics = new AnalyticsService(db, io);

    console.log('[ProofOfOutcome] Service initialized');
  }

  // === Convenience Methods ===

  /**
   * Process a proposal that has finished voting
   * Creates outcome, resolves predictions, updates trust scores
   */
  async processProposalCompletion(proposalId: string, decision: 'approved' | 'rejected'): Promise<any> {
    // Create outcome record
    const outcome = this.outcomes.createFromProposal(proposalId, decision);

    // Resolve predictions and update trust scores
    const voteOutcome = decision === 'approved' ? 'passed' : 'rejected';
    this.trustScoring.processProposalOutcome(proposalId, voteOutcome);

    return {
      outcome,
      trustUpdated: true,
    };
  }

  /**
   * Complete an outcome with verification
   */
  async completeOutcomeWithVerification(
    outcomeId: string,
    resultSummary: string,
    evidence: string[],
    verifierId: string,
    verifierType: 'human' | 'agent',
    verificationResult: 'success' | 'partial' | 'failure',
    confidence: number
  ): Promise<any> {
    // Complete the outcome
    const outcome = this.outcomes.completeExecution(outcomeId, resultSummary, evidence);

    // Add verification
    const verification = this.outcomes.addVerification(
      outcomeId,
      verifierId,
      verifierType,
      verificationResult,
      confidence,
      evidence
    );

    return {
      outcome,
      verification,
    };
  }

  /**
   * Get comprehensive outcome details with all related data
   */
  getOutcomeWithAnalytics(outcomeId: string): any {
    const outcomeDetails = this.outcomes.getOutcomeWithDetails(outcomeId);
    if (!outcomeDetails) return null;

    // Get agent performances for agents involved
    const agentIds = new Set<string>();

    // Collect agent IDs from verifications
    for (const v of outcomeDetails.verifications) {
      if (v.verifier_type === 'agent') {
        agentIds.add(v.verifier_id);
      }
    }

    const agentPerformances = Array.from(agentIds).map(id =>
      this.trustScoring.getAgentScore(id)
    ).filter(Boolean);

    return {
      ...outcomeDetails,
      agentPerformances,
    };
  }

  /**
   * Get full governance analytics dashboard
   */
  getDashboard(): any {
    const analytics = this.analytics.getDashboardAnalytics();
    const outcomeStats = this.outcomes.getStats();
    const trustStats = this.trustScoring.getStats();

    return {
      ...analytics,
      outcomes: {
        ...analytics.outcomes,
        ...outcomeStats,
      },
      trust: trustStats,
    };
  }

  /**
   * Periodic maintenance tasks
   */
  async runMaintenance(): Promise<any> {
    // Decay inactive agent scores
    const decayedCount = this.trustScoring.decayInactiveScores(7);

    // Recalculate consistency scores for active agents
    const activeAgents = this.trustScoring.getTopAgents(100);
    for (const agent of activeAgents) {
      this.trustScoring.calculateConsistencyScore(agent.agent_id);
    }

    return {
      decayedAgents: decayedCount,
      consistencyRecalculated: activeAgents.length,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export individual services and types
export { OutcomeService } from './outcome';
export { TrustScoringService } from './trust-scoring';
export { AnalyticsService } from './analytics';

export type {
  Outcome,
  OutcomeStatus,
  ExecutionStep,
  OutcomeVerification,
} from './outcome';

export type {
  AgentTrustScore,
  PredictionRecord,
  TrustUpdate,
} from './trust-scoring';

export type {
  GovernanceMetrics,
  TimeSeriesData,
  AgentPerformance,
  SignalToOutcomeCorrelation,
} from './analytics';
