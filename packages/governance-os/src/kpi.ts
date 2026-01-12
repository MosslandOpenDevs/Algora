// ===========================================
// Operational KPIs for Governance OS
// ===========================================
// Per SPEC Section O: Decision Quality, Execution Speed, System Health

import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

/**
 * Decision Quality Metrics (Section O.1)
 */
export interface DecisionQualityMetrics {
  /** All mandatory fields present in Decision Packets (target: 100%) */
  dpCompleteness: number;
  /** Distinct options per Decision Packet (target: ≥3) */
  optionDiversity: number;
  /** Red Team analysis included for HIGH risk (target: 100%) */
  redTeamCoverage: number;
  /** Sources per decision (target: ≥3) */
  evidenceDepth: number;
  /** Predicted vs actual outcomes accuracy (target: ±10%) */
  confidenceCalibration: number;
}

/**
 * Execution Speed Metrics (Section O.2)
 */
export interface ExecutionSpeedMetrics {
  /** Time from signal to issue creation (target: <1 hour) */
  signalToIssueMs: number;
  /** Time from issue to Decision Packet (target: <24 hours) */
  issueToDecisionMs: number;
  /** Time in review queue (target: <72 hours) */
  dpToApprovalMs: number;
  /** Time from unlock to execution (target: <1 hour) */
  approvalToExecutionMs: number;
  /** Total governance cycle (target: <5 days) */
  endToEndMs: number;
}

/**
 * System Health Metrics (Section O.3)
 */
export interface SystemHealthMetrics {
  /** No unplanned stops (target: 99.9%) */
  uptime: number;
  /** Max gap between heartbeats (target: <30 seconds) */
  heartbeatGapMs: number;
  /** Tier 1 or Tier 2 LLM available (target: 99%) */
  llmAvailability: number;
  /** Pending tasks in TODO queue (target: <100) */
  queueDepth: number;
  /** Failed operations (target: <1%) */
  errorRate: number;
}

/**
 * Combined KPI Dashboard
 */
export interface KPIDashboard {
  decisionQuality: DecisionQualityMetrics;
  executionSpeed: ExecutionSpeedMetrics;
  systemHealth: SystemHealthMetrics;
  timestamp: Date;
}

/**
 * KPI Target Thresholds
 */
export interface KPITargets {
  decisionQuality: {
    dpCompleteness: number;
    optionDiversity: number;
    redTeamCoverage: number;
    evidenceDepth: number;
    confidenceCalibration: number;
  };
  executionSpeed: {
    signalToIssueMs: number;
    issueToDecisionMs: number;
    dpToApprovalMs: number;
    approvalToExecutionMs: number;
    endToEndMs: number;
  };
  systemHealth: {
    uptime: number;
    heartbeatGapMs: number;
    llmAvailability: number;
    queueDepth: number;
    errorRate: number;
  };
}

/**
 * KPI Alert
 */
export interface KPIAlert {
  id: string;
  metric: string;
  category: 'decision_quality' | 'execution_speed' | 'system_health';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  targetValue: number;
  timestamp: Date;
}

/**
 * KPI Events
 */
export interface KPIEvents {
  'kpi:updated': { dashboard: KPIDashboard };
  'kpi:alert': { alert: KPIAlert };
  'kpi:threshold_breach': { metric: string; value: number; threshold: number };
}

// ============================================
// Default Targets (from SPEC Section O)
// ============================================

export const DEFAULT_KPI_TARGETS: KPITargets = {
  decisionQuality: {
    dpCompleteness: 100,          // 100%
    optionDiversity: 3,           // ≥3 options
    redTeamCoverage: 100,         // 100% for HIGH risk
    evidenceDepth: 3,             // ≥3 sources
    confidenceCalibration: 10,    // ±10%
  },
  executionSpeed: {
    signalToIssueMs: 3600000,           // <1 hour
    issueToDecisionMs: 86400000,        // <24 hours
    dpToApprovalMs: 259200000,          // <72 hours
    approvalToExecutionMs: 3600000,     // <1 hour
    endToEndMs: 432000000,              // <5 days
  },
  systemHealth: {
    uptime: 99.9,                       // 99.9%
    heartbeatGapMs: 30000,              // <30 seconds
    llmAvailability: 99,                // 99%
    queueDepth: 100,                    // <100 tasks
    errorRate: 1,                       // <1%
  },
};

// ============================================
// KPI Collector
// ============================================

interface MetricSample {
  value: number;
  timestamp: Date;
}

/**
 * Collects and aggregates KPI metrics
 */
export class KPICollector extends EventEmitter {
  private samples: Map<string, MetricSample[]> = new Map();
  private targets: KPITargets;
  private startTime: Date;
  private heartbeatTimes: Date[] = [];
  private errorCount = 0;
  private totalOperations = 0;
  private alerts: KPIAlert[] = [];

  constructor(targets: KPITargets = DEFAULT_KPI_TARGETS) {
    super();
    this.targets = targets;
    this.startTime = new Date();
  }

  // ==========================================
  // Sample Recording
  // ==========================================

  /**
   * Record a metric sample
   */
  recordSample(metric: string, value: number): void {
    const samples = this.samples.get(metric) || [];
    samples.push({ value, timestamp: new Date() });

    // Keep last 1000 samples per metric
    if (samples.length > 1000) {
      samples.shift();
    }

    this.samples.set(metric, samples);

    // Check for threshold breaches
    this.checkThresholds(metric, value);
  }

  /**
   * Record a heartbeat
   */
  recordHeartbeat(): void {
    this.heartbeatTimes.push(new Date());

    // Keep last 100 heartbeats
    if (this.heartbeatTimes.length > 100) {
      this.heartbeatTimes.shift();
    }
  }

  /**
   * Record an operation (success or failure)
   */
  recordOperation(success: boolean): void {
    this.totalOperations++;
    if (!success) {
      this.errorCount++;
    }
  }

  /**
   * Record Decision Packet creation
   */
  recordDecisionPacket(data: {
    hasAllFields: boolean;
    optionCount: number;
    hasRedTeamAnalysis: boolean;
    sourceCount: number;
    riskLevel: 'LOW' | 'MID' | 'HIGH';
  }): void {
    this.recordSample('dp_completeness', data.hasAllFields ? 100 : 0);
    this.recordSample('option_diversity', data.optionCount);

    // Only record Red Team coverage for HIGH risk
    if (data.riskLevel === 'HIGH') {
      this.recordSample('red_team_coverage', data.hasRedTeamAnalysis ? 100 : 0);
    }

    this.recordSample('evidence_depth', data.sourceCount);
  }

  /**
   * Record execution timing
   */
  recordExecutionTiming(stage: keyof ExecutionSpeedMetrics, durationMs: number): void {
    this.recordSample(stage, durationMs);
  }

  // ==========================================
  // Metric Calculation
  // ==========================================

  /**
   * Calculate current Decision Quality metrics
   */
  getDecisionQualityMetrics(): DecisionQualityMetrics {
    return {
      dpCompleteness: this.getAverage('dp_completeness', 100),
      optionDiversity: this.getAverage('option_diversity', 3),
      redTeamCoverage: this.getAverage('red_team_coverage', 100),
      evidenceDepth: this.getAverage('evidence_depth', 3),
      confidenceCalibration: this.getAverage('confidence_calibration', 10),
    };
  }

  /**
   * Calculate current Execution Speed metrics
   */
  getExecutionSpeedMetrics(): ExecutionSpeedMetrics {
    return {
      signalToIssueMs: this.getAverage('signalToIssueMs', 0),
      issueToDecisionMs: this.getAverage('issueToDecisionMs', 0),
      dpToApprovalMs: this.getAverage('dpToApprovalMs', 0),
      approvalToExecutionMs: this.getAverage('approvalToExecutionMs', 0),
      endToEndMs: this.getAverage('endToEndMs', 0),
    };
  }

  /**
   * Calculate current System Health metrics
   */
  getSystemHealthMetrics(): SystemHealthMetrics {
    const now = new Date();
    const uptimeMs = now.getTime() - this.startTime.getTime();
    const uptimePercent = 100; // Assume 100% if running

    // Calculate heartbeat gap
    let heartbeatGap = 0;
    if (this.heartbeatTimes.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < this.heartbeatTimes.length; i++) {
        gaps.push(this.heartbeatTimes[i].getTime() - this.heartbeatTimes[i-1].getTime());
      }
      heartbeatGap = Math.max(...gaps);
    }

    // Calculate error rate
    const errorRate = this.totalOperations > 0
      ? (this.errorCount / this.totalOperations) * 100
      : 0;

    return {
      uptime: uptimePercent,
      heartbeatGapMs: heartbeatGap,
      llmAvailability: this.getAverage('llm_availability', 99),
      queueDepth: this.getAverage('queue_depth', 0),
      errorRate,
    };
  }

  /**
   * Get full KPI dashboard
   */
  getDashboard(): KPIDashboard {
    return {
      decisionQuality: this.getDecisionQualityMetrics(),
      executionSpeed: this.getExecutionSpeedMetrics(),
      systemHealth: this.getSystemHealthMetrics(),
      timestamp: new Date(),
    };
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 50): KPIAlert[] {
    return this.alerts.slice(-limit);
  }

  // ==========================================
  // Threshold Checking
  // ==========================================

  private checkThresholds(metric: string, value: number): void {
    const thresholdMap: Record<string, { target: number; direction: 'above' | 'below'; category: KPIAlert['category'] }> = {
      dp_completeness: { target: this.targets.decisionQuality.dpCompleteness, direction: 'above', category: 'decision_quality' },
      option_diversity: { target: this.targets.decisionQuality.optionDiversity, direction: 'above', category: 'decision_quality' },
      red_team_coverage: { target: this.targets.decisionQuality.redTeamCoverage, direction: 'above', category: 'decision_quality' },
      evidence_depth: { target: this.targets.decisionQuality.evidenceDepth, direction: 'above', category: 'decision_quality' },
      signalToIssueMs: { target: this.targets.executionSpeed.signalToIssueMs, direction: 'below', category: 'execution_speed' },
      issueToDecisionMs: { target: this.targets.executionSpeed.issueToDecisionMs, direction: 'below', category: 'execution_speed' },
      dpToApprovalMs: { target: this.targets.executionSpeed.dpToApprovalMs, direction: 'below', category: 'execution_speed' },
      queue_depth: { target: this.targets.systemHealth.queueDepth, direction: 'below', category: 'system_health' },
    };

    const threshold = thresholdMap[metric];
    if (!threshold) return;

    const breached = threshold.direction === 'above'
      ? value < threshold.target
      : value > threshold.target;

    if (breached) {
      const severity = this.calculateSeverity(value, threshold.target, threshold.direction);
      const alert: KPIAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        metric,
        category: threshold.category,
        severity,
        message: `${metric} ${threshold.direction === 'above' ? 'below' : 'above'} target: ${value} (target: ${threshold.target})`,
        currentValue: value,
        targetValue: threshold.target,
        timestamp: new Date(),
      };

      this.alerts.push(alert);
      if (this.alerts.length > 1000) {
        this.alerts.shift();
      }

      this.emit('kpi:alert', { alert });
      this.emit('kpi:threshold_breach', { metric, value, threshold: threshold.target });
    }
  }

  private calculateSeverity(value: number, target: number, direction: 'above' | 'below'): 'warning' | 'critical' {
    const deviation = Math.abs(value - target) / target;

    // Critical if deviation > 50%
    if (deviation > 0.5) return 'critical';
    return 'warning';
  }

  // ==========================================
  // Helpers
  // ==========================================

  private getAverage(metric: string, defaultValue: number): number {
    const samples = this.samples.get(metric);
    if (!samples || samples.length === 0) return defaultValue;

    const sum = samples.reduce((acc, s) => acc + s.value, 0);
    return sum / samples.length;
  }

  /**
   * Get targets
   */
  getTargets(): KPITargets {
    return { ...this.targets };
  }

  /**
   * Update targets
   */
  setTargets(targets: Partial<KPITargets>): void {
    this.targets = {
      decisionQuality: { ...this.targets.decisionQuality, ...targets.decisionQuality },
      executionSpeed: { ...this.targets.executionSpeed, ...targets.executionSpeed },
      systemHealth: { ...this.targets.systemHealth, ...targets.systemHealth },
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.samples.clear();
    this.heartbeatTimes = [];
    this.errorCount = 0;
    this.totalOperations = 0;
    this.alerts = [];
    this.startTime = new Date();
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(): Record<string, number> {
    const dashboard = this.getDashboard();

    return {
      // Decision Quality
      'algora_dp_completeness': dashboard.decisionQuality.dpCompleteness,
      'algora_option_diversity': dashboard.decisionQuality.optionDiversity,
      'algora_red_team_coverage': dashboard.decisionQuality.redTeamCoverage,
      'algora_evidence_depth': dashboard.decisionQuality.evidenceDepth,
      'algora_confidence_calibration': dashboard.decisionQuality.confidenceCalibration,

      // Execution Speed (in seconds)
      'algora_signal_to_issue_seconds': dashboard.executionSpeed.signalToIssueMs / 1000,
      'algora_issue_to_decision_seconds': dashboard.executionSpeed.issueToDecisionMs / 1000,
      'algora_dp_to_approval_seconds': dashboard.executionSpeed.dpToApprovalMs / 1000,
      'algora_approval_to_execution_seconds': dashboard.executionSpeed.approvalToExecutionMs / 1000,
      'algora_end_to_end_seconds': dashboard.executionSpeed.endToEndMs / 1000,

      // System Health
      'algora_uptime_percent': dashboard.systemHealth.uptime,
      'algora_heartbeat_gap_seconds': dashboard.systemHealth.heartbeatGapMs / 1000,
      'algora_llm_availability_percent': dashboard.systemHealth.llmAvailability,
      'algora_queue_depth': dashboard.systemHealth.queueDepth,
      'algora_error_rate_percent': dashboard.systemHealth.errorRate,
    };
  }
}

// ============================================
// Factory
// ============================================

let globalCollector: KPICollector | null = null;

/**
 * Get or create the global KPI collector
 */
export function getKPICollector(): KPICollector {
  if (!globalCollector) {
    globalCollector = new KPICollector();
  }
  return globalCollector;
}

/**
 * Create a new KPI collector instance
 */
export function createKPICollector(targets?: KPITargets): KPICollector {
  return new KPICollector(targets);
}
