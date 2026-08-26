'use client';

import { useQuery } from '@tanstack/react-query';
import { TerminalBox, TerminalHeader } from './TerminalBox';
import { LiveCounter, ASCIIProgress, Sparkline } from './GlowText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface LiveMetricsProps {
  className?: string;
}

interface LiveStats {
  last10min: number;
  lastHour: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  rate: number;
  byMinute: number[];
}

interface DashboardStats {
  activeAgents: number;
  totalAgents: number;
  activeSessions: number;
  signalsToday: number;
  openIssues: number;
}

interface SystemStatus {
  /** null when the endpoint could not be read — rendered as an em dash. */
  collectors: { running: number; total: number } | null;
  llmQueue: number | null;
}

async function fetchLiveStats(): Promise<LiveStats> {
  const res = await fetch(`${API_URL}/api/signals/live-stats`);
  if (!res.ok) throw new Error('Failed to fetch live stats');
  const data = await res.json();
  // API returns { timeStats: {...}, ratePerMinute, minuteBreakdown, ... }
  return {
    last10min: data.timeStats?.last10min || 0,
    lastHour: data.timeStats?.lastHour || 0,
    today: data.timeStats?.today || 0,
    thisWeek: data.timeStats?.thisWeek || 0,
    thisMonth: data.timeStats?.thisMonth || 0,
    rate: data.ratePerMinute || 0,
    byMinute: (data.minuteBreakdown || []).map((m: { count: number }) => m.count),
  };
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  const data = await res.json();
  return {
    // `?? 0`, not `|| 30`. Zero active agents is a real state, and `||`
    // replaced it with a hard-coded 30 — the live page showed "AGENTS 30"
    // beside a full progress bar while the API was answering 0.
    activeAgents: data.activeAgents ?? 0,
    totalAgents: data.totalAgents ?? 0,
    activeSessions: data.activeSessions ?? 0,
    signalsToday: data.signalsToday ?? 0,
    openIssues: data.openIssues ?? 0,
  };
}

/**
 * The SYSTEM panel's numbers.
 *
 * These were three string literals — "3/3 ACTIVE", "0 pending", "99.9%" — on a
 * page whose whole premise is that it is live. There were four collectors, not
 * three. Settled rather than all-or-nothing so one unreachable endpoint does
 * not blank the other line.
 */
async function fetchSystemStatus(): Promise<SystemStatus> {
  const [collectors, queue] = await Promise.allSettled([
    fetch(`${API_URL}/api/collectors/status`).then(r => r.json()),
    fetch(`${API_URL}/api/agora/llm-queue`).then(r => r.json()),
  ]);

  const list =
    collectors.status === 'fulfilled'
      ? (collectors.value.status ?? collectors.value) as Array<{ isRunning?: boolean }>
      : null;

  return {
    collectors: Array.isArray(list)
      ? { running: list.filter(c => c.isRunning).length, total: list.length }
      : null,
    llmQueue: queue.status === 'fulfilled' ? queue.value.queueSize ?? null : null,
  };
}

export function LiveMetrics({ className }: LiveMetricsProps) {
  const { data: liveStats } = useQuery({
    queryKey: ['live-stats'],
    queryFn: fetchLiveStats,
    refetchInterval: 5000,
  });

  const { data: dashStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 10000,
  });

  const { data: system } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: 10000,
  });

  const metrics = [
    {
      label: 'SIGNALS',
      value: liveStats?.thisMonth || 0,
      format: 'compact' as const,
      trend: liveStats?.byMinute || [],
    },
    {
      label: 'RATE',
      value: liveStats?.rate || 0,
      suffix: '/min',
      format: 'number' as const,
    },
    {
      label: 'SESSIONS',
      value: dashStats?.activeSessions || 0,
      format: 'number' as const,
    },
    {
      label: 'AGENTS',
      value: dashStats?.activeAgents ?? 0,
      max: dashStats?.totalAgents || undefined,
      format: 'number' as const,
    },
    {
      label: 'ISSUES',
      value: dashStats?.openIssues || 0,
      format: 'number' as const,
    },
  ];

  return (
    <TerminalBox title="LIVE METRICS" className={className}>
      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] text-xs">{metric.label}</span>
              <LiveCounter
                value={metric.value}
                suffix={metric.suffix}
                format={metric.format}
                className="text-[var(--live-glow)] font-semibold text-sm"
              />
            </div>
            {metric.trend && metric.trend.length > 0 && (
              <Sparkline data={metric.trend} width={140} height={16} />
            )}
            {metric.max && (
              <ASCIIProgress value={metric.value} max={metric.max} width={12} showPercent={false} />
            )}
          </div>
        ))}

        {/* System Status */}
        <div className="border-t border-[var(--live-border)] pt-3 mt-3">
          <TerminalHeader>SYSTEM</TerminalHeader>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Collectors</span>
              <span
                className={
                  system?.collectors && system.collectors.running === system.collectors.total
                    ? 'text-emerald-600'
                    : 'text-[var(--text-bright)]'
                }
              >
                {system?.collectors
                  ? `${system.collectors.running}/${system.collectors.total} ACTIVE`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">LLM Queue</span>
              <span className="text-[var(--text-bright)]">
                {system?.llmQueue === null || system?.llmQueue === undefined
                  ? '—'
                  : `${system.llmQueue} pending`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </TerminalBox>
  );
}
