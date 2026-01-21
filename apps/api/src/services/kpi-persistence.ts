/**
 * KPI Persistence Service
 * Bridges the in-memory KPICollector with SQLite-backed KPIStorage
 * Periodically snapshots KPI metrics to database for historical analysis
 */

import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  type KPIDashboard,
  type KPICollector,
  getKPICollector,
  DEFAULT_KPI_TARGETS,
} from '@algora/governance-os';

// ============================================
// Types
// ============================================

export interface KPISnapshot {
  id: string;
  timestamp: string;
  // Decision Quality
  dp_completeness: number;
  option_diversity: number;
  red_team_coverage: number;
  evidence_depth: number;
  confidence_calibration: number;
  // Execution Speed (in ms)
  signal_to_issue_ms: number;
  issue_to_decision_ms: number;
  dp_to_approval_ms: number;
  approval_to_execution_ms: number;
  end_to_end_ms: number;
  // System Health
  uptime: number;
  heartbeat_gap_ms: number;
  llm_availability: number;
  queue_depth: number;
  error_rate: number;
}

export interface KPIHistoryQuery {
  metric?: string;
  category?: 'decision_quality' | 'execution_speed' | 'system_health';
  hours?: number;
  limit?: number;
}

export interface KPITrend {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  target?: number;
  status: 'good' | 'warning' | 'critical';
}

// ============================================
// KPI Persistence Service
// ============================================

export class KPIPersistenceService {
  private db: Database.Database;
  private io: SocketServer;
  private kpiCollector: KPICollector;
  private lastSnapshotTime: Date | null = null;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.kpiCollector = getKPICollector();

    // Ensure table exists
    this.initTable();

    // Listen to KPI events
    this.setupListeners();
  }

  // ==========================================
  // Initialization
  // ==========================================

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kpi_snapshots (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        -- Decision Quality
        dp_completeness REAL DEFAULT 0,
        option_diversity REAL DEFAULT 0,
        red_team_coverage REAL DEFAULT 0,
        evidence_depth REAL DEFAULT 0,
        confidence_calibration REAL DEFAULT 0,
        -- Execution Speed (ms)
        signal_to_issue_ms REAL DEFAULT 0,
        issue_to_decision_ms REAL DEFAULT 0,
        dp_to_approval_ms REAL DEFAULT 0,
        approval_to_execution_ms REAL DEFAULT 0,
        end_to_end_ms REAL DEFAULT 0,
        -- System Health
        uptime REAL DEFAULT 0,
        heartbeat_gap_ms REAL DEFAULT 0,
        llm_availability REAL DEFAULT 0,
        queue_depth REAL DEFAULT 0,
        error_rate REAL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_timestamp ON kpi_snapshots(timestamp);
    `);
  }

  private setupListeners(): void {
    // Listen for KPI alerts and persist them
    this.kpiCollector.on('kpi:alert', (data) => {
      this.persistAlert(data.alert);
    });
  }

  // ==========================================
  // Snapshot Operations
  // ==========================================

  /**
   * Take a snapshot of current KPI metrics and persist to database
   */
  takeSnapshot(): KPISnapshot {
    const dashboard = this.kpiCollector.getDashboard();
    const snapshot = this.dashboardToSnapshot(dashboard);

    // Insert into database
    this.db.prepare(`
      INSERT INTO kpi_snapshots (
        id, timestamp,
        dp_completeness, option_diversity, red_team_coverage, evidence_depth, confidence_calibration,
        signal_to_issue_ms, issue_to_decision_ms, dp_to_approval_ms, approval_to_execution_ms, end_to_end_ms,
        uptime, heartbeat_gap_ms, llm_availability, queue_depth, error_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.id,
      snapshot.timestamp,
      snapshot.dp_completeness,
      snapshot.option_diversity,
      snapshot.red_team_coverage,
      snapshot.evidence_depth,
      snapshot.confidence_calibration,
      snapshot.signal_to_issue_ms,
      snapshot.issue_to_decision_ms,
      snapshot.dp_to_approval_ms,
      snapshot.approval_to_execution_ms,
      snapshot.end_to_end_ms,
      snapshot.uptime,
      snapshot.heartbeat_gap_ms,
      snapshot.llm_availability,
      snapshot.queue_depth,
      snapshot.error_rate
    );

    this.lastSnapshotTime = new Date();

    // Emit socket event for real-time dashboard updates
    this.io.emit('kpi:snapshot', {
      snapshot,
      timestamp: snapshot.timestamp,
    });

    console.info(`[KPIPersistence] Snapshot saved: ${snapshot.id}`);

    return snapshot;
  }

  private dashboardToSnapshot(dashboard: KPIDashboard): KPISnapshot {
    return {
      id: uuidv4(),
      timestamp: dashboard.timestamp.toISOString(),
      // Decision Quality
      dp_completeness: dashboard.decisionQuality.dpCompleteness,
      option_diversity: dashboard.decisionQuality.optionDiversity,
      red_team_coverage: dashboard.decisionQuality.redTeamCoverage,
      evidence_depth: dashboard.decisionQuality.evidenceDepth,
      confidence_calibration: dashboard.decisionQuality.confidenceCalibration,
      // Execution Speed
      signal_to_issue_ms: dashboard.executionSpeed.signalToIssueMs,
      issue_to_decision_ms: dashboard.executionSpeed.issueToDecisionMs,
      dp_to_approval_ms: dashboard.executionSpeed.dpToApprovalMs,
      approval_to_execution_ms: dashboard.executionSpeed.approvalToExecutionMs,
      end_to_end_ms: dashboard.executionSpeed.endToEndMs,
      // System Health
      uptime: dashboard.systemHealth.uptime,
      heartbeat_gap_ms: dashboard.systemHealth.heartbeatGapMs,
      llm_availability: dashboard.systemHealth.llmAvailability,
      queue_depth: dashboard.systemHealth.queueDepth,
      error_rate: dashboard.systemHealth.errorRate,
    };
  }

  // ==========================================
  // Alert Persistence
  // ==========================================

  private persistAlert(alert: {
    id: string;
    metric: string;
    category: string;
    severity: string;
    message: string;
    currentValue: number;
    targetValue: number;
    timestamp: Date;
  }): void {
    this.db.prepare(`
      INSERT INTO governance_kpi_alerts
      (id, metric_name, alert_type, severity, current_value, threshold, message, acknowledged, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      alert.id,
      alert.metric,
      alert.category,
      alert.severity,
      alert.currentValue,
      alert.targetValue,
      alert.message,
      alert.timestamp.toISOString()
    );
  }

  // ==========================================
  // Query Operations
  // ==========================================

  /**
   * Get recent KPI snapshots
   */
  getSnapshots(options?: { hours?: number; limit?: number }): KPISnapshot[] {
    const { hours = 24, limit = 100 } = options || {};
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    return this.db.prepare(`
      SELECT * FROM kpi_snapshots
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(since, limit) as KPISnapshot[];
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): KPISnapshot | null {
    return this.db.prepare(`
      SELECT * FROM kpi_snapshots
      ORDER BY timestamp DESC
      LIMIT 1
    `).get() as KPISnapshot | null;
  }

  /**
   * Get snapshot statistics for a time period
   */
  getSnapshotStats(hours = 24): Record<string, { avg: number; min: number; max: number; count: number }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const metrics = [
      'dp_completeness', 'option_diversity', 'red_team_coverage', 'evidence_depth',
      'signal_to_issue_ms', 'issue_to_decision_ms', 'dp_to_approval_ms',
      'uptime', 'llm_availability', 'queue_depth', 'error_rate'
    ];

    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};

    for (const metric of metrics) {
      const result = this.db.prepare(`
        SELECT
          AVG(${metric}) as avg,
          MIN(${metric}) as min,
          MAX(${metric}) as max,
          COUNT(*) as count
        FROM kpi_snapshots
        WHERE timestamp >= ?
      `).get(since) as { avg: number | null; min: number | null; max: number | null; count: number };

      stats[metric] = {
        avg: result.avg ?? 0,
        min: result.min ?? 0,
        max: result.max ?? 0,
        count: result.count,
      };
    }

    return stats;
  }

  /**
   * Get KPI trends (comparing current period to previous period)
   */
  getTrends(hours = 24): KPITrend[] {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const previousPeriodStart = new Date(currentPeriodStart.getTime() - hours * 60 * 60 * 1000);

    const metrics: Array<{
      name: string;
      target: number;
      higherIsBetter: boolean;
      category: 'decision_quality' | 'execution_speed' | 'system_health';
    }> = [
      { name: 'dp_completeness', target: 100, higherIsBetter: true, category: 'decision_quality' },
      { name: 'option_diversity', target: 3, higherIsBetter: true, category: 'decision_quality' },
      { name: 'red_team_coverage', target: 100, higherIsBetter: true, category: 'decision_quality' },
      { name: 'evidence_depth', target: 3, higherIsBetter: true, category: 'decision_quality' },
      { name: 'uptime', target: 99.9, higherIsBetter: true, category: 'system_health' },
      { name: 'llm_availability', target: 99, higherIsBetter: true, category: 'system_health' },
      { name: 'queue_depth', target: 100, higherIsBetter: false, category: 'system_health' },
      { name: 'error_rate', target: 1, higherIsBetter: false, category: 'system_health' },
    ];

    const trends: KPITrend[] = [];

    for (const metric of metrics) {
      const current = this.db.prepare(`
        SELECT AVG(${metric.name}) as avg FROM kpi_snapshots
        WHERE timestamp >= ? AND timestamp < ?
      `).get(currentPeriodStart.toISOString(), now.toISOString()) as { avg: number | null };

      const previous = this.db.prepare(`
        SELECT AVG(${metric.name}) as avg FROM kpi_snapshots
        WHERE timestamp >= ? AND timestamp < ?
      `).get(previousPeriodStart.toISOString(), currentPeriodStart.toISOString()) as { avg: number | null };

      const currentValue = current.avg ?? 0;
      const previousValue = previous.avg ?? 0;
      const change = currentValue - previousValue;
      const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;

      // Determine if trend is good or bad based on metric type
      const isImproving = metric.higherIsBetter ? change > 0 : change < 0;
      const isOnTarget = metric.higherIsBetter
        ? currentValue >= metric.target
        : currentValue <= metric.target;

      trends.push({
        metric: metric.name,
        current: Math.round(currentValue * 100) / 100,
        previous: Math.round(previousValue * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 10) / 10,
        trend: Math.abs(change) < 0.01 ? 'stable' : change > 0 ? 'up' : 'down',
        target: metric.target,
        status: isOnTarget ? 'good' : Math.abs(currentValue - metric.target) / metric.target < 0.2 ? 'warning' : 'critical',
      });
    }

    return trends;
  }

  /**
   * Get hourly aggregated data for charting
   */
  getHourlyData(metric: string, hours = 24): Array<{ hour: string; value: number }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Validate metric name to prevent SQL injection
    const validMetrics = [
      'dp_completeness', 'option_diversity', 'red_team_coverage', 'evidence_depth',
      'confidence_calibration', 'signal_to_issue_ms', 'issue_to_decision_ms',
      'dp_to_approval_ms', 'approval_to_execution_ms', 'end_to_end_ms',
      'uptime', 'heartbeat_gap_ms', 'llm_availability', 'queue_depth', 'error_rate'
    ];

    if (!validMetrics.includes(metric)) {
      return [];
    }

    return this.db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00', timestamp) as hour,
        AVG(${metric}) as value
      FROM kpi_snapshots
      WHERE timestamp >= ?
      GROUP BY hour
      ORDER BY hour ASC
    `).all(since) as Array<{ hour: string; value: number }>;
  }

  /**
   * Get daily aggregated data for charting
   */
  getDailyData(metric: string, days = 7): Array<{ date: string; value: number }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Validate metric name to prevent SQL injection
    const validMetrics = [
      'dp_completeness', 'option_diversity', 'red_team_coverage', 'evidence_depth',
      'confidence_calibration', 'signal_to_issue_ms', 'issue_to_decision_ms',
      'dp_to_approval_ms', 'approval_to_execution_ms', 'end_to_end_ms',
      'uptime', 'heartbeat_gap_ms', 'llm_availability', 'queue_depth', 'error_rate'
    ];

    if (!validMetrics.includes(metric)) {
      return [];
    }

    return this.db.prepare(`
      SELECT
        date(timestamp) as date,
        AVG(${metric}) as value
      FROM kpi_snapshots
      WHERE timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(since) as Array<{ date: string; value: number }>;
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Delete old snapshots to manage database size
   */
  cleanup(retentionDays = 30): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const result = this.db.prepare(`
      DELETE FROM kpi_snapshots WHERE timestamp < ?
    `).run(cutoff);

    if (result.changes > 0) {
      console.info(`[KPIPersistence] Cleaned up ${result.changes} old snapshots`);
    }

    return result.changes;
  }

  // ==========================================
  // Status
  // ==========================================

  /**
   * Get service status
   */
  getStatus(): {
    lastSnapshot: Date | null;
    totalSnapshots: number;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  } {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM kpi_snapshots').get() as { count: number };
    const oldest = this.db.prepare('SELECT MIN(timestamp) as ts FROM kpi_snapshots').get() as { ts: string | null };
    const newest = this.db.prepare('SELECT MAX(timestamp) as ts FROM kpi_snapshots').get() as { ts: string | null };

    return {
      lastSnapshot: this.lastSnapshotTime,
      totalSnapshots: count.count,
      oldestSnapshot: oldest.ts,
      newestSnapshot: newest.ts,
    };
  }

  /**
   * Get KPI collector instance for recording metrics
   */
  getCollector(): KPICollector {
    return this.kpiCollector;
  }

  /**
   * Get current dashboard (from in-memory collector)
   */
  getCurrentDashboard(): KPIDashboard {
    return this.kpiCollector.getDashboard();
  }

  /**
   * Get KPI targets
   */
  getTargets() {
    return DEFAULT_KPI_TARGETS;
  }
}
