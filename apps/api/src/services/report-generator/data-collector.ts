/**
 * Data Collector for Report Generation
 * Collects and aggregates metrics from all governance sources
 */

import type { Database } from 'better-sqlite3';

export interface ReportMetrics {
  period: {
    start: string;
    end: string;
    type: 'weekly' | 'monthly';
  };
  signals: {
    total: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
    trend: number; // % change vs previous period
    topSignals: Array<{ title: string; source: string; severity: string }>;
  };
  issues: {
    detected: number;
    resolved: number;
    inProgress: number;
    byPriority: Record<string, number>;
    byCategory: Record<string, number>;
    resolutionRate: number;
    avgResolutionTime: number; // hours
  };
  proposals: {
    total: number;
    passed: number;
    rejected: number;
    pending: number;
    passRate: number;
    avgParticipation: number;
    totalVotes: number;
    recentProposals: Array<{ title: string; status: string; votes_for: number; votes_against: number }>;
  };
  agents: {
    total: number;
    active: number;
    totalMessages: number;
    avgTrustScore: number;
    topAgents: Array<{ name: string; messages: number; trust_score: number }>;
    byGroup: Record<string, number>;
  };
  sessions: {
    total: number;
    completed: number;
    inProgress: number;
    avgConsensus: number;
    avgRounds: number;
    avgParticipants: number;
    recentSessions: Array<{ topic: string; status: string; consensus_level: number }>;
  };
  system: {
    uptime: number; // percentage
    llmCalls: number;
    llmCost: number;
  };
}

export class DataCollector {
  constructor(private db: Database) {}

  /**
   * Collect all metrics for a given time period
   */
  collectMetrics(startDate: Date, endDate: Date, type: 'weekly' | 'monthly'): ReportMetrics {
    const start = startDate.toISOString();
    const end = endDate.toISOString();

    // Calculate previous period for trend comparison
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs).toISOString();
    const prevEnd = start;

    return {
      period: { start, end, type },
      signals: this.collectSignalMetrics(start, end, prevStart, prevEnd),
      issues: this.collectIssueMetrics(start, end),
      proposals: this.collectProposalMetrics(start, end),
      agents: this.collectAgentMetrics(start, end),
      sessions: this.collectSessionMetrics(start, end),
      system: this.collectSystemMetrics(start, end),
    };
  }

  private collectSignalMetrics(
    start: string,
    end: string,
    prevStart: string,
    prevEnd: string
  ): ReportMetrics['signals'] {
    // Total signals in period (use timestamp column)
    const totalResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE timestamp BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const total = totalResult?.count || 0;

    // Previous period total for trend
    const prevResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE timestamp BETWEEN ? AND ?
    `).get(prevStart, prevEnd) as { count: number } | undefined;
    const prevTotal = prevResult?.count || 0;
    const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

    // By category
    const byCategory: Record<string, number> = {};
    const categoryRows = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM signals
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY category
    `).all(start, end) as Array<{ category: string; count: number }>;
    for (const row of categoryRows) {
      byCategory[row.category || 'unknown'] = row.count;
    }

    // By source
    const bySource: Record<string, number> = {};
    const sourceRows = this.db.prepare(`
      SELECT source, COUNT(*) as count FROM signals
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY source
    `).all(start, end) as Array<{ source: string; count: number }>;
    for (const row of sourceRows) {
      bySource[row.source || 'unknown'] = row.count;
    }

    // By severity
    const bySeverity: Record<string, number> = {};
    const severityRows = this.db.prepare(`
      SELECT severity, COUNT(*) as count FROM signals
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY severity
    `).all(start, end) as Array<{ severity: string; count: number }>;
    for (const row of severityRows) {
      bySeverity[row.severity || 'info'] = row.count;
    }

    // Top signals (description instead of title, timestamp instead of collected_at)
    const topSignals = this.db.prepare(`
      SELECT description as title, source, severity FROM signals
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        timestamp DESC
      LIMIT 5
    `).all(start, end) as Array<{ title: string; source: string; severity: string }>;

    return { total, byCategory, bySource, bySeverity, trend, topSignals };
  }

  private collectIssueMetrics(start: string, end: string): ReportMetrics['issues'] {
    // Detected in period
    const detectedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM issues
      WHERE detected_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const detected = detectedResult?.count || 0;

    // Resolved in period
    const resolvedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM issues
      WHERE resolved_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const resolved = resolvedResult?.count || 0;

    // In progress (detected but not resolved)
    const inProgressResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM issues
      WHERE status IN ('open', 'investigating', 'in_progress')
    `).get() as { count: number } | undefined;
    const inProgress = inProgressResult?.count || 0;

    // By priority
    const byPriority: Record<string, number> = {};
    const priorityRows = this.db.prepare(`
      SELECT priority, COUNT(*) as count FROM issues
      WHERE detected_at BETWEEN ? AND ?
      GROUP BY priority
    `).all(start, end) as Array<{ priority: string; count: number }>;
    for (const row of priorityRows) {
      byPriority[row.priority || 'medium'] = row.count;
    }

    // By category
    const byCategory: Record<string, number> = {};
    const categoryRows = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM issues
      WHERE detected_at BETWEEN ? AND ?
      GROUP BY category
    `).all(start, end) as Array<{ category: string; count: number }>;
    for (const row of categoryRows) {
      byCategory[row.category || 'other'] = row.count;
    }

    // Resolution rate
    const resolutionRate = detected > 0 ? (resolved / detected) * 100 : 0;

    // Average resolution time (in hours)
    const avgTimeResult = this.db.prepare(`
      SELECT AVG((julianday(resolved_at) - julianday(detected_at)) * 24) as avg_hours
      FROM issues
      WHERE resolved_at BETWEEN ? AND ?
        AND detected_at IS NOT NULL
    `).get(start, end) as { avg_hours: number | null } | undefined;
    const avgResolutionTime = avgTimeResult?.avg_hours || 0;

    return { detected, resolved, inProgress, byPriority, byCategory, resolutionRate, avgResolutionTime };
  }

  private collectProposalMetrics(start: string, end: string): ReportMetrics['proposals'] {
    // Total proposals in period
    const totalResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals
      WHERE created_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const total = totalResult?.count || 0;

    // By status
    const passedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals
      WHERE status = 'passed' AND updated_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const passed = passedResult?.count || 0;

    const rejectedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals
      WHERE status = 'rejected' AND updated_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const rejected = rejectedResult?.count || 0;

    const pendingResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM proposals
      WHERE status IN ('pending', 'voting', 'active')
    `).get() as { count: number } | undefined;
    const pending = pendingResult?.count || 0;

    // Pass rate
    const decided = passed + rejected;
    const passRate = decided > 0 ? (passed / decided) * 100 : 0;

    // Total votes
    const votesResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM votes
      WHERE created_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const totalVotes = votesResult?.count || 0;

    // Average participation (votes per proposal)
    const avgParticipation = total > 0 ? totalVotes / total : 0;

    // Recent proposals (parse tally JSON for vote counts)
    const recentProposalsRaw = this.db.prepare(`
      SELECT title, status, tally FROM proposals
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(start, end) as Array<{ title: string; status: string; tally: string | null }>;

    const recentProposals = recentProposalsRaw.map(p => {
      let votesFor = 0;
      let votesAgainst = 0;
      if (p.tally) {
        try {
          const tally = JSON.parse(p.tally);
          votesFor = tally.for || tally.votes_for || 0;
          votesAgainst = tally.against || tally.votes_against || 0;
        } catch {
          // Invalid JSON, use defaults
        }
      }
      return {
        title: p.title,
        status: p.status,
        votes_for: votesFor,
        votes_against: votesAgainst,
      };
    });

    return { total, passed, rejected, pending, passRate, avgParticipation, totalVotes, recentProposals };
  }

  private collectAgentMetrics(start: string, end: string): ReportMetrics['agents'] {
    // Total agents
    const totalResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM agents
    `).get() as { count: number } | undefined;
    const totalAgents = totalResult?.count || 0;

    // Active agents (those with messages in period)
    const activeResult = this.db.prepare(`
      SELECT COUNT(DISTINCT agent_id) as count FROM agora_messages
      WHERE created_at BETWEEN ? AND ?
        AND message_type = 'agent'
    `).get(start, end) as { count: number } | undefined;
    const active = activeResult?.count || 0;

    // Total messages
    const messagesResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM agora_messages
      WHERE created_at BETWEEN ? AND ?
        AND message_type = 'agent'
    `).get(start, end) as { count: number } | undefined;
    const totalMessages = messagesResult?.count || 0;

    // Average trust score (default to 0.8 since we don't have this column)
    const avgTrustScore = 0.8;

    // Top agents by activity (use display_name, default trust_score to 0.8)
    const topAgentsRaw = this.db.prepare(`
      SELECT
        a.display_name as name,
        COUNT(m.id) as messages
      FROM agents a
      LEFT JOIN agora_messages m ON a.id = m.agent_id
        AND m.created_at BETWEEN ? AND ?
        AND m.message_type = 'agent'
      GROUP BY a.id
      ORDER BY messages DESC
      LIMIT 5
    `).all(start, end) as Array<{ name: string; messages: number }>;

    const topAgents = topAgentsRaw.map(a => ({
      name: a.name,
      messages: a.messages,
      trust_score: 0.8, // Default trust score
    }));

    // By group
    const byGroup: Record<string, number> = {};
    const groupRows = this.db.prepare(`
      SELECT group_name, COUNT(*) as count FROM agents
      GROUP BY group_name
    `).all() as Array<{ group_name: string; count: number }>;
    for (const row of groupRows) {
      byGroup[row.group_name || 'other'] = row.count;
    }

    return { total: totalAgents, active, totalMessages, avgTrustScore, topAgents, byGroup };
  }

  private collectSessionMetrics(start: string, end: string): ReportMetrics['sessions'] {
    // Total sessions in period
    const totalResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE created_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const total = totalResult?.count || 0;

    // Completed sessions
    const completedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE status = 'completed'
        AND created_at BETWEEN ? AND ?
    `).get(start, end) as { count: number } | undefined;
    const completed = completedResult?.count || 0;

    // In progress sessions
    const inProgressResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE status IN ('active', 'in_progress')
    `).get() as { count: number } | undefined;
    const inProgress = inProgressResult?.count || 0;

    // Average consensus level (using consensus_score column)
    const consensusResult = this.db.prepare(`
      SELECT AVG(consensus_score) as avg FROM agora_sessions
      WHERE status = 'completed'
        AND created_at BETWEEN ? AND ?
    `).get(start, end) as { avg: number | null } | undefined;
    const avgConsensus = (consensusResult?.avg || 0) * 100; // Convert to percentage

    // Average rounds
    const roundsResult = this.db.prepare(`
      SELECT AVG(current_round) as avg FROM agora_sessions
      WHERE status = 'completed'
        AND created_at BETWEEN ? AND ?
    `).get(start, end) as { avg: number | null } | undefined;
    const avgRounds = roundsResult?.avg || 0;

    // Average participants
    const participantsResult = this.db.prepare(`
      SELECT AVG(participant_count) as avg FROM (
        SELECT session_id, COUNT(DISTINCT agent_id) as participant_count
        FROM agora_messages
        WHERE created_at BETWEEN ? AND ?
          AND message_type = 'agent'
        GROUP BY session_id
      )
    `).get(start, end) as { avg: number | null } | undefined;
    const avgParticipants = participantsResult?.avg || 0;

    // Recent sessions (use title instead of topic, consensus_score instead of consensus_level)
    const recentSessionsRaw = this.db.prepare(`
      SELECT title as topic, status, consensus_score FROM agora_sessions
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(start, end) as Array<{ topic: string; status: string; consensus_score: number | null }>;

    const recentSessions = recentSessionsRaw.map(s => ({
      topic: s.topic,
      status: s.status,
      consensus_level: (s.consensus_score || 0) * 100, // Convert to percentage
    }));

    return { total, completed, inProgress, avgConsensus, avgRounds, avgParticipants, recentSessions };
  }

  private collectSystemMetrics(_start: string, _end: string): ReportMetrics['system'] {
    // Return default values since analytics table may not exist
    // In a production system, this would query actual metrics
    return {
      uptime: 99.9, // Placeholder
      llmCalls: 0,
      llmCost: 0,
    };
  }
}
