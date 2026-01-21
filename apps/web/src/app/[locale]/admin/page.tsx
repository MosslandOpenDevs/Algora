'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Activity,
  Database,
  DollarSign,
  Server,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  HardDrive,
  Cpu,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface LLMUsageData {
  today: {
    date: string;
    summary: Array<{
      provider: string;
      tier: number;
      calls: number;
      tokens: number;
      cost: number;
    }>;
    tier1Calls: number;
    tier2Calls: number;
    tier1Ratio: number;
    totalCost: number;
  };
  history: Array<{
    date: string;
    provider: string;
    tier: number;
    calls: number;
    tokens: number;
    cost: number;
  }>;
  period: string;
}

interface DataGrowthData {
  current: Record<string, number>;
  dailyAverages: Record<string, number>;
  dailyGrowth: Array<{
    date: string;
    table_name: string;
    new_rows: number;
  }>;
  totalRows: number;
  estimatedSizeMB: number;
  period: string;
}

interface SystemHealthData {
  health: {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  errors: {
    today: number;
    yesterday: number;
    warnings: number;
    llmTimeouts: number;
  };
  budget: {
    totalBudget: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  };
  scheduler: {
    isRunning: boolean;
    activeIntervals: string[];
  } | null;
  dataRetention: {
    activityLogRetentionDays: number;
    heartbeatRetentionDays: number;
    chatterRetentionDays: number;
    signalRetentionDays: number;
    budgetUsageRetentionDays: number;
  } | null;
  dataSizes: Record<string, number> | null;
  timestamp: string;
}

interface KPITrend {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  target?: number;
  status: 'good' | 'warning' | 'critical';
}

interface KPITrendsData {
  trends: KPITrend[];
  period: string;
  timestamp: string;
}

interface KPIStatusData {
  lastSnapshot: string | null;
  totalSnapshots: number;
  oldestSnapshot: string | null;
  newestSnapshot: string | null;
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  color = 'agora-primary',
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-agora-muted">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {trend !== undefined && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              <TrendingUp className={`h-3 w-3 ${trend >= 0 ? 'text-green-500' : 'text-red-500 rotate-180'}`} />
              <span className={trend >= 0 ? 'text-green-500' : 'text-red-500'}>
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
              {trendLabel && <span className="text-agora-muted">{trendLabel}</span>}
            </div>
          )}
        </div>
        <div className={`rounded-lg p-3 bg-${color}/10`}>
          <Icon className={`h-6 w-6 text-${color}`} />
        </div>
      </div>
    </div>
  );
}

function HealthBadge({ status }: { status: 'healthy' | 'degraded' | 'critical' }) {
  const config = {
    healthy: { color: 'green', icon: CheckCircle, label: 'Healthy' },
    degraded: { color: 'yellow', icon: AlertTriangle, label: 'Degraded' },
    critical: { color: 'red', icon: XCircle, label: 'Critical' },
  };

  const { color, icon: Icon, label } = config[status];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-${color}-500/10 text-${color}-500`}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default function AdminPage() {
  const t = useTranslations('Admin');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch LLM usage data
  const { data: llmUsage, isLoading: loadingLLM } = useQuery<LLMUsageData>({
    queryKey: ['admin-llm-usage', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/stats/llm-usage?days=7`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Fetch data growth data
  const { data: dataGrowth, isLoading: loadingData } = useQuery<DataGrowthData>({
    queryKey: ['admin-data-growth', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/stats/data-growth?days=7`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Fetch system health
  const { data: health, isLoading: loadingHealth } = useQuery<SystemHealthData>({
    queryKey: ['admin-health', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/stats/system-health`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch KPI trends
  const { data: kpiTrends, isLoading: loadingKPI } = useQuery<KPITrendsData>({
    queryKey: ['admin-kpi-trends', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/stats/kpi/trends?hours=24`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Fetch KPI status
  const { data: kpiStatus } = useQuery<KPIStatusData>({
    queryKey: ['admin-kpi-status', refreshKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/stats/kpi/status`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  const isLoading = loadingLLM || loadingData || loadingHealth || loadingKPI;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('title') || 'Admin Dashboard'}
          </h1>
          <p className="text-agora-muted">
            {t('subtitle') || 'System monitoring and administration'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-agora-card dark:bg-agora-dark-card border border-agora-border dark:border-agora-dark-border px-4 py-2 text-sm font-medium text-slate-900 dark:text-white transition-colors hover:bg-agora-border dark:hover:bg-agora-dark-border disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Health Overview */}
      {health && (
        <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-agora-primary" />
              System Health
            </h2>
            <HealthBadge status={health.health.status} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
              <p className="text-3xl font-bold text-agora-primary">{health.health.score}</p>
              <p className="text-sm text-agora-muted mt-1">Health Score</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
              <p className="text-3xl font-bold text-red-500">{health.errors.today}</p>
              <p className="text-sm text-agora-muted mt-1">Errors Today</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
              <p className="text-3xl font-bold text-yellow-500">{health.errors.warnings}</p>
              <p className="text-sm text-agora-muted mt-1">Warnings</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
              <p className="text-3xl font-bold text-orange-500">{health.errors.llmTimeouts}</p>
              <p className="text-sm text-agora-muted mt-1">LLM Timeouts</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's LLM Calls"
          value={llmUsage ? (llmUsage.today.tier1Calls + llmUsage.today.tier2Calls).toLocaleString() : '—'}
          icon={Cpu}
          color="agora-primary"
        />
        <StatCard
          title="Local LLM Ratio"
          value={llmUsage ? `${llmUsage.today.tier1Ratio}%` : '—'}
          icon={Server}
          color="agora-secondary"
        />
        <StatCard
          title="Today's Cost"
          value={llmUsage ? `$${llmUsage.today.totalCost.toFixed(4)}` : '—'}
          icon={DollarSign}
          color="agora-warning"
        />
        <StatCard
          title="Total Records"
          value={dataGrowth ? dataGrowth.totalRows.toLocaleString() : '—'}
          icon={Database}
          color="agora-tertiary"
        />
      </div>

      {/* Budget & LLM Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Status */}
        {health && (
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-agora-warning" />
              Budget Status
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-agora-muted">Daily Budget</span>
                  <span className="text-slate-900 dark:text-white font-medium">
                    ${health.budget.spent.toFixed(4)} / ${health.budget.totalBudget.toFixed(2)}
                  </span>
                </div>
                <div className="h-3 bg-agora-darker dark:bg-agora-dark-darker rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      health.budget.percentUsed > 90 ? 'bg-red-500' :
                      health.budget.percentUsed > 70 ? 'bg-yellow-500' :
                      'bg-agora-primary'
                    }`}
                    style={{ width: `${Math.min(health.budget.percentUsed, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-agora-muted mt-2">
                  {health.budget.percentUsed.toFixed(1)}% used — ${health.budget.remaining.toFixed(4)} remaining
                </p>
              </div>
            </div>
          </div>
        )}

        {/* LLM Provider Breakdown */}
        {llmUsage && (
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-agora-tertiary" />
              LLM Usage by Provider
            </h2>

            <div className="space-y-3">
              {llmUsage.today.summary.map((item, idx) => (
                <div key={`${item.provider}-${item.tier}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      item.tier === 1 ? 'bg-green-500' : 'bg-purple-500'
                    }`} />
                    <span className="text-sm text-slate-900 dark:text-white capitalize">
                      {item.provider} (Tier {item.tier})
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {item.calls.toLocaleString()} calls
                    </p>
                    <p className="text-xs text-agora-muted">
                      {item.tokens.toLocaleString()} tokens
                      {item.cost > 0 && ` · $${item.cost.toFixed(4)}`}
                    </p>
                  </div>
                </div>
              ))}

              {llmUsage.today.summary.length === 0 && (
                <p className="text-sm text-agora-muted text-center py-4">No LLM usage today</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Data & Retention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Sizes */}
        {health?.dataSizes && (
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <HardDrive className="h-5 w-5 text-agora-secondary" />
              Database Tables
            </h2>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(health.dataSizes)
                .sort(([, a], [, b]) => b - a)
                .map(([table, count]) => (
                  <div key={table} className="flex items-center justify-between py-2 border-b border-agora-border dark:border-agora-dark-border last:border-0">
                    <span className="text-sm text-slate-900 dark:text-white font-mono">{table}</span>
                    <span className="text-sm text-agora-muted">
                      {count >= 0 ? count.toLocaleString() : 'N/A'} rows
                    </span>
                  </div>
                ))}
            </div>

            {dataGrowth && (
              <div className="mt-4 pt-4 border-t border-agora-border dark:border-agora-dark-border">
                <p className="text-sm text-agora-muted">
                  Estimated size: <span className="font-medium text-slate-900 dark:text-white">{dataGrowth.estimatedSizeMB} MB</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Data Retention Policy */}
        {health?.dataRetention && (
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Trash2 className="h-5 w-5 text-red-500" />
              Data Retention Policy
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-900 dark:text-white">Activity Logs</span>
                <span className="text-sm px-2 py-1 rounded bg-agora-darker dark:bg-agora-dark-darker text-agora-muted">
                  {health.dataRetention.activityLogRetentionDays} days
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-900 dark:text-white">Heartbeat Data</span>
                <span className="text-sm px-2 py-1 rounded bg-agora-darker dark:bg-agora-dark-darker text-agora-muted">
                  {health.dataRetention.heartbeatRetentionDays} days
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-900 dark:text-white">Agent Chatter</span>
                <span className="text-sm px-2 py-1 rounded bg-agora-darker dark:bg-agora-dark-darker text-agora-muted">
                  {health.dataRetention.chatterRetentionDays} days
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-900 dark:text-white">Signals</span>
                <span className="text-sm px-2 py-1 rounded bg-agora-darker dark:bg-agora-dark-darker text-agora-muted">
                  {health.dataRetention.signalRetentionDays} days
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-900 dark:text-white">Budget Usage</span>
                <span className="text-sm px-2 py-1 rounded bg-agora-darker dark:bg-agora-dark-darker text-agora-muted">
                  {health.dataRetention.budgetUsageRetentionDays} days
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs text-agora-muted">
              Cleanup runs daily at 03:00 UTC. Issues, proposals, votes, and agora messages are retained permanently.
            </p>
          </div>
        )}
      </div>

      {/* KPI Metrics */}
      {kpiTrends && kpiTrends.trends && kpiTrends.trends.length > 0 && (
        <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-agora-primary" />
              KPI Metrics (24h)
            </h2>
            {kpiStatus && (
              <span className="text-xs text-agora-muted">
                {kpiStatus.totalSnapshots} snapshots
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiTrends.trends.map((trend) => (
              <div
                key={trend.metric}
                className={`p-4 rounded-lg border ${
                  trend.status === 'good' ? 'border-green-500/30 bg-green-500/5' :
                  trend.status === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                  'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-agora-muted">
                    {trend.metric.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    trend.status === 'good' ? 'bg-green-500/20 text-green-500' :
                    trend.status === 'warning' ? 'bg-yellow-500/20 text-yellow-500' :
                    'bg-red-500/20 text-red-500'
                  }`}>
                    {trend.status}
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {trend.metric.includes('_ms')
                    ? `${(trend.current / 1000 / 60).toFixed(1)}m`
                    : trend.metric.includes('depth') || trend.metric.includes('diversity')
                    ? trend.current.toFixed(1)
                    : `${trend.current.toFixed(1)}%`
                  }
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <TrendingUp
                    className={`h-3 w-3 ${
                      trend.trend === 'up' ? 'text-green-500' :
                      trend.trend === 'down' ? 'text-red-500 rotate-180' :
                      'text-agora-muted'
                    }`}
                  />
                  <span className={`text-xs ${
                    trend.changePercent > 0 ? 'text-green-500' :
                    trend.changePercent < 0 ? 'text-red-500' :
                    'text-agora-muted'
                  }`}>
                    {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(1)}%
                  </span>
                  {trend.target !== undefined && (
                    <span className="text-xs text-agora-muted">
                      (target: {trend.target})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {kpiStatus?.lastSnapshot && (
            <p className="mt-4 text-xs text-agora-muted">
              Last snapshot: {new Date(kpiStatus.lastSnapshot).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Scheduler Status */}
      {health?.scheduler && (
        <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-agora-accent" />
            Scheduler Status
          </h2>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${health.scheduler.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-slate-900 dark:text-white">
                {health.scheduler.isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>

            <div className="text-sm text-agora-muted">
              Active: {health.scheduler.activeIntervals.join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Last Updated */}
      {health && (
        <p className="text-xs text-agora-muted text-right">
          Last updated: {new Date(health.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}
