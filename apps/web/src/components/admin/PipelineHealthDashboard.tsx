'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Clock,
  TrendingUp,
  Zap,
  Users,
  FileText,
  MessageSquare,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface PipelineHealthData {
  health: {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  stages: Record<string, {
    status: 'healthy' | 'degraded' | 'critical';
    score: number;
    details: Record<string, unknown>;
  }>;
  timestamp: string;
}

interface PipelineMetricsData {
  period: string;
  throughput: {
    signals: { total: number; critical: number; high: number; perHour: number };
    issues: { detected: number; resolved: number; inProgress: number };
    sessions: { total: number; completed: number; avgConsensus: number | null };
    proposals: { total: number; draft: number; pending: number; approved: number };
  };
  latency: { signalToIssueMinutes: number | null };
  retryQueue: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    needsManualReview: number;
  };
  timestamp: string;
}

interface PipelineAlertsData {
  alerts: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    type: string;
    message: string;
    details: Record<string, unknown>;
    timestamp: string;
  }>;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  timestamp: string;
}

const PIPELINE_STAGES = [
  { key: 'signalCollection', name: 'Signal Collection', icon: Zap, description: 'RSS, GitHub, Blockchain, Social' },
  { key: 'issueDetection', name: 'Issue Detection', icon: AlertCircle, description: 'Anomaly detection' },
  { key: 'agoraDeliberation', name: 'Agora Deliberation', icon: MessageSquare, description: 'Agent discussions' },
  { key: 'proposalGeneration', name: 'Proposal Generation', icon: FileText, description: 'Auto-proposals' },
  { key: 'pipelineExecution', name: 'Pipeline Execution', icon: Activity, description: 'Workflow processing' },
  { key: 'escalation', name: 'Escalation', icon: Users, description: 'Human review routing' },
];

function HealthBadge({ status }: { status: 'healthy' | 'degraded' | 'critical' }) {
  const config = {
    healthy: { bg: 'bg-green-500/10', text: 'text-green-500', icon: CheckCircle },
    degraded: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', icon: AlertTriangle },
    critical: { bg: 'bg-red-500/10', text: 'text-red-500', icon: XCircle },
  };
  const { bg, text, icon: Icon } = config[status];

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${bg} ${text}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium capitalize">{status}</span>
    </div>
  );
}

function StageCard({
  stage,
  data
}: {
  stage: typeof PIPELINE_STAGES[0];
  data: { status: 'healthy' | 'degraded' | 'critical'; score: number; details: Record<string, unknown> } | undefined;
}) {
  const Icon = stage.icon;
  const statusColors = {
    healthy: 'border-green-500/30 bg-green-500/5',
    degraded: 'border-yellow-500/30 bg-yellow-500/5',
    critical: 'border-red-500/30 bg-red-500/5',
  };

  const status = data?.status || 'degraded';
  const score = data?.score || 0;

  return (
    <div className={`p-4 rounded-lg border ${statusColors[status]}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-agora-muted" />
          <span className="text-sm font-medium text-slate-900 dark:text-white">{stage.name}</span>
        </div>
        <div className="shrink-0">
          <HealthBadge status={status} />
        </div>
      </div>
      <p className="text-xs text-agora-muted mb-2">{stage.description}</p>
      <div>
        <span className="text-lg font-bold text-slate-900 dark:text-white">{score}%</span>
        {data?.details && Object.keys(data.details).length > 0 && (
          <p className="mt-1 break-words text-xs text-agora-muted">
            {Object.entries(data.details)
              .filter(([k]) => !['collectors', 'byType', 'retryQueue'].includes(k))
              .slice(0, 2)
              .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : '...'}`)
              .join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

function AlertItem({ alert }: { alert: PipelineAlertsData['alerts'][0] }) {
  const severityConfig = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: AlertTriangle, iconColor: 'text-yellow-500' },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: AlertCircle, iconColor: 'text-blue-500' },
  };
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <div className={`p-3 rounded-lg border ${config.border} ${config.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-900 dark:text-white">{alert.message}</p>
          <p className="text-xs text-agora-muted mt-1">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PipelineHealthDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch pipeline health
  const { data: health, isLoading: loadingHealth } = useQuery<PipelineHealthData>({
    queryKey: ['pipeline-health', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/pipeline/health`);
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch pipeline metrics
  const { data: metrics, isLoading: loadingMetrics } = useQuery<PipelineMetricsData>({
    queryKey: ['pipeline-metrics', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/pipeline/metrics`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Fetch pipeline alerts
  const { data: alerts, isLoading: loadingAlerts } = useQuery<PipelineAlertsData>({
    queryKey: ['pipeline-alerts', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/pipeline/alerts`);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const handleRefresh = () => setRefreshKey(k => k + 1);
  const isLoading = loadingHealth || loadingMetrics || loadingAlerts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-agora-primary" />
            Pipeline Health Monitor
          </h2>
          <p className="text-sm text-agora-muted">
            Signal → Issue → Agora → Proposal → Decision
          </p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {health.health.score}
              </span>
              <HealthBadge status={health.health.status} />
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh pipeline health"
            className="p-2 rounded-lg bg-agora-card dark:bg-agora-dark-card border border-agora-border dark:border-agora-dark-border hover:bg-agora-border dark:hover:bg-agora-dark-border disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pipeline Stages Visualization */}
      <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-4">Pipeline Stages</h3>

        {/* Visual Pipeline Flow */}
        <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, index) => {
            const stageData = health?.stages[stage.key];
            const Icon = stage.icon;
            const statusColors = {
              healthy: 'bg-green-500',
              degraded: 'bg-yellow-500',
              critical: 'bg-red-500',
            };
            const bgColor = stageData ? statusColors[stageData.status] : 'bg-gray-400';

            return (
              <div key={stage.key} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs text-agora-muted mt-1 text-center max-w-[80px]">
                    {stage.name}
                  </span>
                </div>
                {index < PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-agora-muted mx-2 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Stage Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STAGES.map(stage => (
            <StageCard
              key={stage.key}
              stage={stage}
              data={health?.stages[stage.key]}
            />
          ))}
        </div>
      </div>

      {/* Metrics & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Throughput Metrics */}
        {metrics && (
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-agora-primary" />
              Throughput (24h)
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-agora-muted">Signals</span>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {metrics.throughput.signals.total.toLocaleString()}
                </p>
                <p className="text-xs text-agora-muted">
                  {metrics.throughput.signals.perHour}/hr avg
                </p>
              </div>

              <div className="p-3 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-agora-muted">Issues</span>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {metrics.throughput.issues.detected}
                </p>
                <p className="text-xs text-agora-muted">
                  {metrics.throughput.issues.resolved} resolved
                </p>
              </div>

              <div className="p-3 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-agora-muted">Sessions</span>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {metrics.throughput.sessions.completed}
                </p>
                <p className="text-xs text-agora-muted">
                  {metrics.throughput.sessions.avgConsensus !== null
                    ? `${metrics.throughput.sessions.avgConsensus}% avg consensus`
                    : 'No data'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-agora-muted">Proposals</span>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {metrics.throughput.proposals.total}
                </p>
                <p className="text-xs text-agora-muted">
                  {metrics.throughput.proposals.approved} approved
                </p>
              </div>
            </div>

            {/* Retry Queue Status */}
            <div className="mt-4 pt-4 border-t border-agora-border dark:border-agora-dark-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-900 dark:text-white flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  Retry Queue
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-agora-muted">
                  Pending: <span className="text-slate-900 dark:text-white font-medium">{metrics.retryQueue.pending}</span>
                </span>
                <span className="text-agora-muted">
                  Active: <span className="text-slate-900 dark:text-white font-medium">{metrics.retryQueue.active}</span>
                </span>
                {metrics.retryQueue.needsManualReview > 0 && (
                  <span className="text-yellow-500">
                    Manual Review: {metrics.retryQueue.needsManualReview}
                  </span>
                )}
              </div>
            </div>

            {/* Latency */}
            {metrics.latency.signalToIssueMinutes !== null && (
              <div className="mt-4 pt-4 border-t border-agora-border dark:border-agora-dark-border">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-agora-muted" />
                  <span className="text-xs text-agora-muted">
                    Avg Signal → Issue:
                    <span className="font-medium text-slate-900 dark:text-white ml-1">
                      {metrics.latency.signalToIssueMinutes} min
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alerts */}
        <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Active Alerts
            </h3>
            {alerts && (
              <div className="flex items-center gap-2 text-xs">
                {alerts.summary.critical > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                    {alerts.summary.critical} critical
                  </span>
                )}
                {alerts.summary.warning > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">
                    {alerts.summary.warning} warning
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts && alerts.alerts.length > 0 ? (
              alerts.alerts.map(alert => (
                <AlertItem key={alert.id} alert={alert} />
              ))
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-agora-muted">No active alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {health && (
        <p className="text-xs text-agora-muted text-right">
          Last updated: {new Date(health.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default PipelineHealthDashboard;
