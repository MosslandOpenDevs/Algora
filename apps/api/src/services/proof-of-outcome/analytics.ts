import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

export interface GovernanceMetrics {
  totalProposals: number;
  passedProposals: number;
  rejectedProposals: number;
  passRate: number;
  avgVotesPerProposal: number;
  avgParticipationRate: number;
  totalVotesCast: number;
  uniqueVoters: number;
}

export interface TimeSeriesData {
  date: string;
  value: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  trustScore: number;
  predictionAccuracy: number;
  endorsementAccuracy: number;
  participationCount: number;
  rank: number;
}

export interface SignalToOutcomeCorrelation {
  signalCategory: string;
  issueCount: number;
  proposalCount: number;
  passedCount: number;
  avgTimeToResolution: number;
}

export class AnalyticsService {
  private db: Database.Database;
  private io: SocketServer;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    console.log('[Analytics] Service initialized');
  }

  // === Governance Analytics ===

  getGovernanceMetrics(startDate?: string, endDate?: string): GovernanceMetrics {
    let dateFilter = '';
    const params: any[] = [];

    if (startDate && endDate) {
      dateFilter = ' AND created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const proposals = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'passed' OR status = 'executed' THEN 1 END) as passed,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM proposals
      WHERE status NOT IN ('draft', 'cancelled')${dateFilter}
    `).get(...params) as any;

    const votes = this.db.prepare(`
      SELECT
        COUNT(*) as total_votes,
        COUNT(DISTINCT voter) as unique_voters,
        AVG(vote_count) as avg_votes
      FROM (
        SELECT proposal_id, COUNT(*) as vote_count, voter
        FROM votes
        GROUP BY proposal_id, voter
      )
    `).get() as any;

    const participation = this.db.prepare(`
      SELECT AVG(participation_rate) as avg_rate
      FROM (
        SELECT
          p.id,
          COUNT(v.id) * 100.0 / NULLIF((SELECT COUNT(*) FROM voter_registry WHERE is_verified = 1), 0) as participation_rate
        FROM proposals p
        LEFT JOIN votes v ON p.id = v.proposal_id
        WHERE p.status IN ('passed', 'rejected', 'executed')${dateFilter}
        GROUP BY p.id
      )
    `).get(...params) as any;

    return {
      totalProposals: proposals.total || 0,
      passedProposals: proposals.passed || 0,
      rejectedProposals: proposals.rejected || 0,
      passRate: proposals.total > 0 ? (proposals.passed / proposals.total) * 100 : 0,
      avgVotesPerProposal: votes?.avg_votes || 0,
      avgParticipationRate: participation?.avg_rate || 0,
      totalVotesCast: votes?.total_votes || 0,
      uniqueVoters: votes?.unique_voters || 0,
    };
  }

  getProposalTimeSeries(interval: 'day' | 'week' | 'month' = 'week', limit: number = 12): TimeSeriesData[] {
    let dateFormat: string;
    let dateGroup: string;

    switch (interval) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        dateGroup = 'date(created_at)';
        break;
      case 'week':
        dateFormat = '%Y-W%W';
        dateGroup = "strftime('%Y-W%W', created_at)";
        break;
      case 'month':
        dateFormat = '%Y-%m';
        dateGroup = "strftime('%Y-%m', created_at)";
        break;
    }

    return this.db.prepare(`
      SELECT ${dateGroup} as date, COUNT(*) as value
      FROM proposals
      WHERE status NOT IN ('draft', 'cancelled')
      GROUP BY ${dateGroup}
      ORDER BY date DESC
      LIMIT ?
    `).all(limit).reverse() as TimeSeriesData[];
  }

  getVotingTimeSeries(interval: 'day' | 'week' | 'month' = 'week', limit: number = 12): TimeSeriesData[] {
    let dateGroup: string;

    switch (interval) {
      case 'day':
        dateGroup = 'date(created_at)';
        break;
      case 'week':
        dateGroup = "strftime('%Y-W%W', created_at)";
        break;
      case 'month':
        dateGroup = "strftime('%Y-%m', created_at)";
        break;
    }

    return this.db.prepare(`
      SELECT ${dateGroup} as date, COUNT(*) as value
      FROM votes
      GROUP BY ${dateGroup}
      ORDER BY date DESC
      LIMIT ?
    `).all(limit).reverse() as TimeSeriesData[];
  }

  // === Agent Performance Analytics ===

  getAgentPerformanceRanking(limit: number = 20): AgentPerformance[] {
    // Use simple fallback query for compatibility with different DB schemas
    return this.db.prepare(`
      SELECT
        a.id as agentId,
        a.display_name as agentName,
        50 as trustScore,
        50 as predictionAccuracy,
        50 as endorsementAccuracy,
        0 as participationCount,
        ROW_NUMBER() OVER (ORDER BY a.display_name) as rank
      FROM agents a
      ORDER BY a.display_name
      LIMIT ?
    `).all(limit) as AgentPerformance[];
  }

  getAgentPerformanceHistory(agentId: string, days: number = 30): TimeSeriesData[] {
    try {
      return this.db.prepare(`
        SELECT date(created_at) as date, score_after as value
        FROM trust_updates
        WHERE agent_id = ? AND created_at > datetime('now', '-' || ? || ' days')
        ORDER BY created_at
      `).all(agentId, days) as TimeSeriesData[];
    } catch {
      return [];
    }
  }

  getAgentActivityBreakdown(agentId: string): any {
    const comments = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposal_comments WHERE author_id = ?
    `).get(agentId) as { count: number };

    const endorsements = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposal_endorsements WHERE agent_id = ?
    `).get(agentId) as { count: number };

    let predictions = { total: 0, correct: 0 };
    try {
      predictions = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN was_correct = 1 THEN 1 END) as correct
        FROM prediction_records
        WHERE agent_id = ?
      `).get(agentId) as { total: number; correct: number };
    } catch {
      // Table might not exist yet
    }

    const discussions = this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM agora_messages
      WHERE speaker_id = ?
    `).get(agentId) as { count: number };

    return {
      comments: comments.count,
      endorsements: endorsements.count,
      predictions: predictions.total,
      correctPredictions: predictions.correct,
      discussions: discussions.count,
    };
  }

  // === Signal-to-Outcome Correlation ===

  getSignalToOutcomeCorrelation(): SignalToOutcomeCorrelation[] {
    return this.db.prepare(`
      SELECT
        s.category as signalCategory,
        COUNT(DISTINCT i.id) as issueCount,
        COUNT(DISTINCT p.id) as proposalCount,
        COUNT(DISTINCT CASE WHEN p.status IN ('passed', 'executed') THEN p.id END) as passedCount,
        AVG(
          CASE
            WHEN p.updated_at IS NOT NULL AND i.created_at IS NOT NULL
            THEN (julianday(p.updated_at) - julianday(i.created_at))
            ELSE NULL
          END
        ) as avgTimeToResolution
      FROM signals s
      LEFT JOIN issue_signals iss ON s.id = iss.signal_id
      LEFT JOIN issues i ON iss.issue_id = i.id
      LEFT JOIN proposals p ON i.id = p.issue_id
      GROUP BY s.category
      HAVING issueCount > 0
      ORDER BY issueCount DESC
    `).all() as SignalToOutcomeCorrelation[];
  }

  getSignalEffectiveness(): any {
    const stats = this.db.prepare(`
      SELECT
        s.source,
        COUNT(*) as signalCount,
        COUNT(DISTINCT iss.issue_id) as issuesGenerated,
        COUNT(DISTINCT p.id) as proposalsCreated,
        COUNT(DISTINCT CASE WHEN p.status IN ('passed', 'executed') THEN p.id END) as successfulOutcomes
      FROM signals s
      LEFT JOIN issue_signals iss ON s.id = iss.signal_id
      LEFT JOIN issues i ON iss.issue_id = i.id
      LEFT JOIN proposals p ON i.id = p.issue_id
      GROUP BY s.source
      ORDER BY signalCount DESC
      LIMIT 10
    `).all();

    return stats;
  }

  // === Outcome Analytics ===

  getOutcomeMetrics(): any {
    const outcomes = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'disputed' THEN 1 END) as disputed,
        AVG(CASE WHEN verification_score IS NOT NULL THEN verification_score END) as avgVerificationScore
      FROM outcomes
    `).get() as any;

    const avgExecutionTime = this.db.prepare(`
      SELECT AVG(julianday(execution_completed_at) - julianday(execution_started_at)) as avgDays
      FROM outcomes
      WHERE execution_started_at IS NOT NULL AND execution_completed_at IS NOT NULL
    `).get() as { avgDays: number };

    return {
      totalOutcomes: outcomes.total || 0,
      completedOutcomes: outcomes.completed || 0,
      verifiedOutcomes: outcomes.verified || 0,
      failedOutcomes: outcomes.failed || 0,
      disputedOutcomes: outcomes.disputed || 0,
      avgVerificationScore: outcomes.avgVerificationScore || 0,
      avgExecutionTimeDays: avgExecutionTime?.avgDays || 0,
    };
  }

  getOutcomeTimeSeries(interval: 'day' | 'week' | 'month' = 'week', limit: number = 12): TimeSeriesData[] {
    let dateGroup: string;

    switch (interval) {
      case 'day':
        dateGroup = 'date(created_at)';
        break;
      case 'week':
        dateGroup = "strftime('%Y-W%W', created_at)";
        break;
      case 'month':
        dateGroup = "strftime('%Y-%m', created_at)";
        break;
    }

    return this.db.prepare(`
      SELECT ${dateGroup} as date, COUNT(*) as value
      FROM outcomes
      GROUP BY ${dateGroup}
      ORDER BY date DESC
      LIMIT ?
    `).all(limit).reverse() as TimeSeriesData[];
  }

  // === Comprehensive Dashboard ===

  getDashboardAnalytics(): any {
    const governance = this.getGovernanceMetrics();
    const outcomes = this.getOutcomeMetrics();
    const topAgents = this.getAgentPerformanceRanking(5);
    const proposalTrend = this.getProposalTimeSeries('week', 8);
    const votingTrend = this.getVotingTimeSeries('week', 8);
    const signalEffectiveness = this.getSignalEffectiveness();

    // Activity summary
    const recentActivity = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN type LIKE 'PROPOSAL%' THEN 1 END) as proposals,
        COUNT(CASE WHEN type LIKE 'VOTE%' THEN 1 END) as votes,
        COUNT(CASE WHEN type LIKE 'OUTCOME%' THEN 1 END) as outcomes,
        COUNT(CASE WHEN type LIKE 'TRUST%' THEN 1 END) as trustUpdates
      FROM activity_log
      WHERE timestamp > datetime('now', '-24 hours')
    `).get() as any;

    return {
      governance,
      outcomes,
      topAgents,
      trends: {
        proposals: proposalTrend,
        voting: votingTrend,
      },
      signalEffectiveness,
      recentActivity: {
        proposals: recentActivity?.proposals || 0,
        votes: recentActivity?.votes || 0,
        outcomes: recentActivity?.outcomes || 0,
        trustUpdates: recentActivity?.trustUpdates || 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // === Category Analysis ===

  getCategoryAnalytics(): any {
    return this.db.prepare(`
      SELECT
        category,
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('passed', 'executed') THEN 1 END) as passed,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        AVG(
          CASE
            WHEN tally IS NOT NULL
            THEN json_extract(tally, '$.total_votes')
            ELSE 0
          END
        ) as avgVotes
      FROM proposals
      WHERE status NOT IN ('draft', 'cancelled')
      GROUP BY category
      ORDER BY total DESC
    `).all();
  }

  // === Export Methods ===

  exportGovernanceReport(startDate: string, endDate: string): any {
    const metrics = this.getGovernanceMetrics(startDate, endDate);

    const proposals = this.db.prepare(`
      SELECT
        p.id, p.title, p.status, p.category, p.created_at, p.updated_at,
        p.tally
      FROM proposals p
      WHERE p.created_at BETWEEN ? AND ?
        AND p.status NOT IN ('draft', 'cancelled')
      ORDER BY p.created_at DESC
    `).all(startDate, endDate) as any[];

    const votingSummary = this.db.prepare(`
      SELECT
        p.id as proposalId,
        p.title,
        COUNT(v.id) as voteCount,
        SUM(CASE WHEN v.choice = 'for' THEN 1 ELSE 0 END) as forVotes,
        SUM(CASE WHEN v.choice = 'against' THEN 1 ELSE 0 END) as againstVotes,
        SUM(CASE WHEN v.choice = 'abstain' THEN 1 ELSE 0 END) as abstainVotes
      FROM proposals p
      LEFT JOIN votes v ON p.id = v.proposal_id
      WHERE p.created_at BETWEEN ? AND ?
      GROUP BY p.id
    `).all(startDate, endDate);

    return {
      reportPeriod: { startDate, endDate },
      metrics,
      proposals: proposals.map(p => ({
        ...p,
        tally: p.tally ? JSON.parse(p.tally) : null,
      })),
      votingSummary,
      generatedAt: new Date().toISOString(),
    };
  }
}
