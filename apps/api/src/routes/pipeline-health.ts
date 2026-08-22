/**
 * Pipeline Health API Routes
 *
 * Provides monitoring endpoints for the governance pipeline:
 * - GET /health - Overall pipeline health status (0-100 score)
 * - GET /metrics - Processing throughput and latency metrics
 * - GET /alerts - Active alerts and warnings
 * - GET /stages - Status of each pipeline stage
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { SignalCollectorService } from '../services/collectors';
import type { GovernanceOSBridge } from '../services/governance-os-bridge';
import type { SchedulerService } from '../scheduler';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';
import { isoHoursAgo } from '../utils/time';

const router = Router();

/**
 * How long a machine-owned escalation may sit before it counts as stalled.
 *
 * An extended_discussion escalation resolves when its follow-up deliberation
 * completes, and a deliberation runs in minutes to a couple of hours. Six
 * hours is comfortably past that, so anything older was never picked up.
 */
const ESCALATION_STALL_HOURS = 6;

// Helper to get services from app.locals
function getServices(req: Request): {
  db: Database.Database;
  collectorService: SignalCollectorService | null;
  governanceOSBridge: GovernanceOSBridge | null;
  schedulerService: SchedulerService | null;
} {
  return {
    db: req.app.locals.db,
    collectorService: req.app.locals.signalCollector || null,
    governanceOSBridge: req.app.locals.governanceOSBridge || null,
    schedulerService: req.app.locals.schedulerService || null,
  };
}

/**
 * GET /api/pipeline/health
 * Returns overall pipeline health score and status
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const { db, collectorService, governanceOSBridge, schedulerService } = getServices(req);

    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const stages = calculateStageHealth(db, collectorService, governanceOSBridge, schedulerService);
    const overallScore = calculateOverallHealth(stages);

    const status = overallScore >= 80 ? 'healthy' :
                   overallScore >= 50 ? 'degraded' : 'critical';

    res.json({
      health: {
        score: overallScore,
        status,
      },
      stages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting health:', error);
    res.status(500).json({ error: 'Failed to get pipeline health' });
  }
});

/**
 * GET /api/pipeline/metrics
 * Returns processing throughput and latency metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const { db, schedulerService } = getServices(req);

    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Signal throughput (last 24h)
    const signalMetrics = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high
      FROM signals
      WHERE created_at >= ?
    `).get(oneDayAgo.toISOString()) as { total: number; critical: number; high: number };

    // Issue detection rate
    const issueMetrics = db.prepare(`
      SELECT
        COUNT(*) as detected,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
      FROM issues
      WHERE created_at >= ?
    `).get(oneDayAgo.toISOString()) as { detected: number; resolved: number; in_progress: number };

    // Agora session metrics
    const agoraMetrics = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        AVG(consensus_score) as avg_consensus
      FROM agora_sessions
      WHERE created_at >= ?
    `).get(oneDayAgo.toISOString()) as { total_sessions: number; completed: number; avg_consensus: number | null };

    // Proposal metrics
    const proposalMetrics = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
      FROM proposals
      WHERE created_at >= ?
    `).get(oneDayAgo.toISOString()) as { total: number; draft: number; pending: number; approved: number };

    // Pipeline latency (average time from signal to issue)
    const latencyData = db.prepare(`
      SELECT
        AVG(julianday(i.detected_at) - julianday(s.created_at)) * 24 * 60 as avg_signal_to_issue_minutes
      FROM issues i
      JOIN (
        SELECT id, created_at FROM signals WHERE created_at >= ?
      ) s ON i.signal_ids LIKE '%' || s.id || '%'
      WHERE i.created_at >= ?
    `).get(oneDayAgo.toISOString(), oneDayAgo.toISOString()) as { avg_signal_to_issue_minutes: number | null };

    // Pipeline retry stats
    const retryStats = schedulerService?.getPipelineRetryStats() || {
      pending: 0, active: 0, completed: 0, failed: 0, needsManualReview: 0,
    };

    res.json({
      period: '24h',
      throughput: {
        signals: {
          total: signalMetrics?.total || 0,
          critical: signalMetrics?.critical || 0,
          high: signalMetrics?.high || 0,
          perHour: Math.round((signalMetrics?.total || 0) / 24),
        },
        issues: {
          detected: issueMetrics?.detected || 0,
          resolved: issueMetrics?.resolved || 0,
          inProgress: issueMetrics?.in_progress || 0,
        },
        sessions: {
          total: agoraMetrics?.total_sessions || 0,
          completed: agoraMetrics?.completed || 0,
          avgConsensus: agoraMetrics?.avg_consensus ? Math.round(agoraMetrics.avg_consensus * 100) : null,
        },
        proposals: {
          total: proposalMetrics?.total || 0,
          draft: proposalMetrics?.draft || 0,
          pending: proposalMetrics?.pending || 0,
          approved: proposalMetrics?.approved || 0,
        },
      },
      latency: {
        signalToIssueMinutes: latencyData?.avg_signal_to_issue_minutes
          ? Math.round(latencyData.avg_signal_to_issue_minutes)
          : null,
      },
      retryQueue: retryStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get pipeline metrics' });
  }
});

/**
 * GET /api/pipeline/alerts
 * Returns active alerts and warnings
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const { db, collectorService, governanceOSBridge, schedulerService } = getServices(req);

    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const alerts: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info';
      type: string;
      message: string;
      details: Record<string, unknown>;
      timestamp: string;
    }> = [];

    // Check for collector health issues
    if (collectorService) {
      const collectorHealth = collectorService.getAllHealth();
      for (const health of collectorHealth) {
        if (health.consecutiveFailures >= 3) {
          alerts.push({
            id: `collector-${health.name}-failures`,
            severity: 'critical',
            type: 'collector_failure',
            message: `Collector ${health.name} has ${health.consecutiveFailures} consecutive failures`,
            details: {
              collector: health.name,
              consecutiveFailures: health.consecutiveFailures,
              lastError: health.lastError,
              lastFailureAt: health.lastFailureAt?.toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Staleness comes from the service, which measures each collector
      // against its own configured fetch interval. This used to apply a flat
      // 5-minute window of its own and so warned constantly about collectors
      // polling on a correct 30- or 120-minute schedule.
      for (const staleness of collectorService.getStaleness()) {
        if (!staleness.isStale) continue;

        alerts.push({
          id: `collector-${staleness.name}-stale`,
          severity: 'warning',
          type: 'collector_stale',
          message: `Collector ${staleness.name} has not fetched successfully in over ${staleness.thresholdMinutes} minutes`,
          details: {
            collector: staleness.name,
            lastFetchedAt: staleness.lastFetchedAt,
            minutesSinceFetch: staleness.minutesSinceFetch,
            thresholdMinutes: staleness.thresholdMinutes,
            enabledSources: staleness.enabledSources,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Escalations split by who has to act. A backlog waiting on people is an
    // alert — someone can do something about it — while a deliberation the
    // system owns and never ran is a fault, and reads as one.
    if (governanceOSBridge) {
      const pendingEscalations = governanceOSBridge.getPendingEscalations();

      const awaitingPeople = pendingEscalations.filter(
        e => e.escalationType === 'human_review' || e.escalationType === 'working_group',
      );
      if (awaitingPeople.length > 0) {
        alerts.push({
          id: 'escalations-awaiting-people',
          severity: 'warning',
          type: 'human_review_pending',
          message: `${awaitingPeople.length} session(s) awaiting human action`,
          details: {
            count: awaitingPeople.length,
            humanReview: awaitingPeople.filter(e => e.escalationType === 'human_review').length,
            workingGroup: awaitingPeople.filter(e => e.escalationType === 'working_group').length,
            sessionIds: awaitingPeople.map(e => e.sessionId.slice(0, 8)),
          },
          timestamp: new Date().toISOString(),
        });
      }

      const stalledSince = Date.now() - ESCALATION_STALL_HOURS * 60 * 60 * 1000;
      const stalled = pendingEscalations.filter(
        e => e.escalationType === 'extended_discussion' && e.createdAt.getTime() < stalledSince,
      );
      if (stalled.length > 0) {
        alerts.push({
          id: 'escalations-stalled',
          severity: 'critical',
          type: 'escalation_stalled',
          message: `${stalled.length} extended discussion(s) never started after ${ESCALATION_STALL_HOURS}h`,
          details: {
            count: stalled.length,
            sessionIds: stalled.map(e => e.sessionId.slice(0, 8)),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Check for items needing manual review
    const manualReviewItems = db.prepare(`
      SELECT COUNT(*) as count FROM issues WHERE status = 'needs_manual_review'
    `).get() as { count: number };

    if (manualReviewItems.count > 0) {
      alerts.push({
        id: 'issues-manual-review',
        severity: 'warning',
        type: 'manual_review_needed',
        message: `${manualReviewItems.count} issue(s) need manual review after pipeline failures`,
        details: { count: manualReviewItems.count },
        timestamp: new Date().toISOString(),
      });
    }

    // Check for retry queue issues
    const retryStats = schedulerService?.getPipelineRetryStats();
    if (retryStats && retryStats.needsManualReview > 0) {
      alerts.push({
        id: 'retry-queue-exhausted',
        severity: 'warning',
        type: 'retry_exhausted',
        message: `${retryStats.needsManualReview} pipeline(s) exhausted retry attempts`,
        details: retryStats,
        timestamp: new Date().toISOString(),
      });
    }

    // Check for high retry queue
    if (retryStats && retryStats.pending > 5) {
      alerts.push({
        id: 'retry-queue-high',
        severity: 'info',
        type: 'retry_queue_high',
        message: `${retryStats.pending} pipeline(s) pending retry`,
        details: retryStats,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      alerts: alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      summary: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
        total: alerts.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get pipeline alerts' });
  }
});

/**
 * GET /api/pipeline/stages
 * Returns detailed status of each pipeline stage
 */
router.get('/stages', (req: Request, res: Response) => {
  try {
    const { db, collectorService, governanceOSBridge, schedulerService } = getServices(req);

    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const stages = calculateStageHealth(db, collectorService, governanceOSBridge, schedulerService);
    res.json({
      stages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting stages:', error);
    res.status(500).json({ error: 'Failed to get pipeline stages' });
  }
});

/**
 * POST /api/pipeline/retry/:issueId
 * Manually queue a pipeline retry for an issue
 */
router.post('/retry/:issueId', writeLimiter, requireAdmin, async (req: Request, res: Response) => {
  const { db, schedulerService } = getServices(req);

  if (!schedulerService) {
    return res.status(503).json({ error: 'Scheduler service not available' });
  }

  const { issueId } = req.params;

  // Verify issue exists
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as { category: string } | undefined;
  if (!issue) {
    return res.status(404).json({ error: 'Issue not found' });
  }

  try {
    const workflowType = determineWorkflowType(issue.category);
    await schedulerService.queuePipelineRetry(issueId, workflowType);

    res.json({
      success: true,
      message: `Pipeline retry queued for issue ${issueId}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error queueing retry:', error);
    res.status(500).json({ error: 'Failed to queue pipeline retry' });
  }
});

/**
 * GET /api/pipeline/collectors
 * Returns collector health status
 */
router.get('/collectors', (req: Request, res: Response) => {
  try {
    const { collectorService } = getServices(req);

    if (!collectorService) {
      return res.status(503).json({ error: 'Collector service not available' });
    }

    const health = collectorService.getAllHealth();
    const status = collectorService.getStatus();

    res.json({
      collectors: health.map(h => ({
        name: h.name,
        isRunning: h.isRunning,
        lastSuccessAt: h.lastSuccessAt?.toISOString(),
        lastFailureAt: h.lastFailureAt?.toISOString(),
        consecutiveFailures: h.consecutiveFailures,
        totalSuccesses: h.totalSuccesses,
        totalFailures: h.totalFailures,
        restartCount: h.restartCount,
        lastError: h.lastError,
      })),
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting collectors:', error);
    res.status(500).json({ error: 'Failed to get collector status' });
  }
});

/**
 * GET /api/pipeline/escalations
 * Returns pending escalations
 */
router.get('/escalations', (req: Request, res: Response) => {
  try {
    const { governanceOSBridge } = getServices(req);

    if (!governanceOSBridge) {
      return res.status(503).json({ error: 'Governance OS Bridge not available' });
    }

    const escalations = governanceOSBridge.getPendingEscalations();

    res.json({
      escalations: escalations.map(e => ({
        id: e.id,
        sessionId: e.sessionId,
        issueId: e.issueId,
        escalationType: e.escalationType,
        consensusScore: e.consensusScore,
        totalRounds: e.totalRounds,
        reason: e.reason,
        status: e.status,
        assignedTo: e.assignedTo,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      summary: {
        total: escalations.length,
        byType: {
          extendedDiscussion: escalations.filter(e => e.escalationType === 'extended_discussion').length,
          workingGroup: escalations.filter(e => e.escalationType === 'working_group').length,
          humanReview: escalations.filter(e => e.escalationType === 'human_review').length,
        },
        byStatus: {
          pending: escalations.filter(e => e.status === 'pending').length,
          inProgress: escalations.filter(e => e.status === 'in_progress').length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error getting escalations:', error);
    res.status(500).json({ error: 'Failed to get escalations' });
  }
});

/**
 * POST /api/pipeline/escalations/:id/resolve
 * Resolve an escalation
 */
router.post('/escalations/:id/resolve', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  try {
    const { governanceOSBridge } = getServices(req);

    if (!governanceOSBridge) {
      return res.status(503).json({ error: 'Governance OS Bridge not available' });
    }

    const { id } = req.params;
    const { resolution } = req.body;

    if (!resolution || typeof resolution !== 'string') {
      return res.status(400).json({ error: 'Resolution text is required' });
    }

    const success = governanceOSBridge.resolveEscalation(id, resolution);

    if (!success) {
      return res.status(404).json({ error: 'Escalation not found' });
    }

    res.json({
      success: true,
      message: `Escalation ${id} resolved`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error resolving escalation:', error);
    res.status(500).json({ error: 'Failed to resolve escalation' });
  }
});

/**
 * POST /api/pipeline/backfill
 * Manually trigger proposal backfill
 */
router.post('/backfill', writeLimiter, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { schedulerService } = getServices(req);

    if (!schedulerService) {
      return res.status(503).json({ error: 'Scheduler service not available' });
    }

    const result = await schedulerService.triggerProposalBackfill();

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PipelineHealth] Error triggering backfill:', error);
    res.status(500).json({ error: 'Failed to trigger proposal backfill' });
  }
});

// Helper function to calculate health for each pipeline stage
function calculateStageHealth(
  db: Database.Database,
  collectorService: SignalCollectorService | null,
  governanceOSBridge: GovernanceOSBridge | null,
  schedulerService: SchedulerService | null
): Record<string, {
  status: 'healthy' | 'degraded' | 'critical';
  score: number;
  details: Record<string, unknown>;
}> {
  const stages: Record<string, {
    status: 'healthy' | 'degraded' | 'critical';
    score: number;
    details: Record<string, unknown>;
  }> = {};

  // Stage 1: Signal Collection
  if (collectorService) {
    const collectorHealth = collectorService.getAllHealth();
    const healthyCollectors = collectorHealth.filter(h => h.consecutiveFailures < 3).length;
    const collectorScore = collectorHealth.length > 0
      ? Math.round((healthyCollectors / collectorHealth.length) * 100)
      : 100;
    stages.signalCollection = {
      status: collectorScore >= 75 ? 'healthy' : collectorScore >= 50 ? 'degraded' : 'critical',
      score: collectorScore,
      details: {
        collectors: collectorHealth.map(h => ({
          name: h.name,
          isRunning: h.isRunning,
          consecutiveFailures: h.consecutiveFailures,
          lastSuccessAt: h.lastSuccessAt?.toISOString(),
        })),
        totalCollectors: collectorHealth.length,
        healthyCollectors,
      },
    };
  } else {
    stages.signalCollection = {
      status: 'degraded',
      score: 50,
      details: { message: 'Collector service not available' },
    };
  }

  // Stage 2: Issue Detection
  const recentIssues = db.prepare(`
    SELECT COUNT(*) as count FROM issues WHERE created_at >= datetime('now', '-1 hour')
  `).get() as { count: number };
  const pendingIssues = db.prepare(`
    SELECT COUNT(*) as count FROM issues WHERE status IN ('detected', 'confirmed')
  `).get() as { count: number };
  const issueScore = recentIssues.count > 0 || pendingIssues.count < 10 ? 100 : 50;
  stages.issueDetection = {
    status: issueScore >= 75 ? 'healthy' : issueScore >= 50 ? 'degraded' : 'critical',
    score: issueScore,
    details: {
      recentIssues: recentIssues.count,
      pendingIssues: pendingIssues.count,
    },
  };

  // Stage 3: Agora Deliberation
  const activeSessions = db.prepare(`
    SELECT COUNT(*) as count FROM agora_sessions WHERE status = 'active'
  `).get() as { count: number };
  const recentCompleted = db.prepare(`
    SELECT COUNT(*) as count FROM agora_sessions
    WHERE status = 'completed' AND concluded_at >= ?
  `).get(isoHoursAgo(24)) as { count: number };
  const agoraScore = activeSessions.count <= 10 && recentCompleted.count >= 0 ? 100 : 70;
  stages.agoraDeliberation = {
    status: agoraScore >= 75 ? 'healthy' : agoraScore >= 50 ? 'degraded' : 'critical',
    score: agoraScore,
    details: {
      activeSessions: activeSessions.count,
      completedLast24h: recentCompleted.count,
    },
  };

  // Stage 4: Proposal Generation
  const draftProposals = db.prepare(`
    SELECT COUNT(*) as count FROM proposals WHERE status = 'draft'
  `).get() as { count: number };
  const pendingProposals = db.prepare(`
    SELECT COUNT(*) as count FROM proposals WHERE status = 'pending'
  `).get() as { count: number };
  const proposalScore = draftProposals.count < 20 ? 100 : 70;
  stages.proposalGeneration = {
    status: proposalScore >= 75 ? 'healthy' : proposalScore >= 50 ? 'degraded' : 'critical',
    score: proposalScore,
    details: {
      draftProposals: draftProposals.count,
      pendingProposals: pendingProposals.count,
    },
  };

  // Stage 5: Pipeline Execution
  const retryStats = schedulerService?.getPipelineRetryStats() || {
    pending: 0, active: 0, completed: 0, failed: 0, needsManualReview: 0,
  };
  const pipelineScore = retryStats.needsManualReview === 0 && retryStats.pending < 5 ? 100 :
                        retryStats.needsManualReview < 3 ? 70 : 40;
  stages.pipelineExecution = {
    status: pipelineScore >= 75 ? 'healthy' : pipelineScore >= 50 ? 'degraded' : 'critical',
    score: pipelineScore,
    details: {
      retryQueue: retryStats,
    },
  };

  // Stage 6: Escalation
  //
  // Health here means "is the machine still moving", not "is the queue empty".
  // Only extended_discussion resolves on its own — handleAgoraSessionCompleted
  // closes it when the follow-up deliberation finishes. working_group and
  // human_review wait on people by design and can legitimately sit open for
  // weeks. Scoring the raw total conflated the two, so an ordinary human
  // backlog read as a pipeline failure, and a signal stuck red is a signal
  // people stop reading — which is how a timeline that 500'd on every issue
  // went unnoticed for two weeks.
  //
  // So the score reacts to one thing: a machine-owned escalation that should
  // have been picked up and was not. Human backlog is reported here and
  // alerted on separately, where something can actually be done about it.
  const pendingEscalations = governanceOSBridge?.getPendingEscalations() || [];
  const machineOwned = pendingEscalations.filter(e => e.escalationType === 'extended_discussion');
  const awaitingPeople = pendingEscalations.length - machineOwned.length;

  const stalledSince = Date.now() - ESCALATION_STALL_HOURS * 60 * 60 * 1000;
  const stalled = machineOwned.filter(e => e.createdAt.getTime() < stalledSince);
  const oldestStalledHours = stalled.length === 0
    ? 0
    : Math.floor((Date.now() - Math.min(...stalled.map(e => e.createdAt.getTime()))) / 3_600_000);

  const escalationScore = stalled.length === 0 ? 100 : stalled.length < 3 ? 70 : 40;
  stages.escalation = {
    status: escalationScore >= 75 ? 'healthy' : escalationScore >= 50 ? 'degraded' : 'critical',
    score: escalationScore,
    details: {
      pendingEscalations: pendingEscalations.length,
      // What the score reacts to: deliberations the system owns and has not run.
      stalled: stalled.length,
      oldestStalledHours,
      // Reported, never penalised — these are waiting on people, not on us.
      awaitingPeople,
      byType: {
        extendedDiscussion: machineOwned.length,
        workingGroup: pendingEscalations.filter(e => e.escalationType === 'working_group').length,
        humanReview: pendingEscalations.filter(e => e.escalationType === 'human_review').length,
      },
    },
  };

  return stages;
}

// Calculate overall health score from stage scores
function calculateOverallHealth(stages: Record<string, { score: number }>): number {
  const scores = Object.values(stages).map(s => s.score);
  if (scores.length === 0) return 100;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

// Determine workflow type based on category
function determineWorkflowType(category: string): 'A' | 'B' | 'C' | 'D' | 'E' {
  const cat = category.toLowerCase();
  if (cat.includes('ai') || cat.includes('research') || cat.includes('academic')) return 'A';
  if (cat.includes('dev') || cat.includes('grant') || cat.includes('developer')) return 'C';
  if (cat.includes('partnership') || cat.includes('expansion') || cat.includes('ecosystem')) return 'D';
  if (cat.includes('group') || cat.includes('committee') || cat.includes('working')) return 'E';
  return 'B';
}

export const pipelineHealthRouter: Router = router;
