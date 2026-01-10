'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
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
  activeSessions: number;
  signalsToday: number;
  openIssues: number;
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
    activeAgents: data.activeAgents || 30,
    activeSessions: data.activeSessions || 0,
    signalsToday: data.signalsToday || 0,
    openIssues: data.openIssues || 0,
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
      value: dashStats?.activeAgents || 0,
      max: 30,
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
              <span className="text-emerald-600">3/3 ACTIVE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">LLM Queue</span>
              <span className="text-[var(--text-bright)]">0 pending</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Uptime</span>
              <span className="text-emerald-600">99.9%</span>
            </div>
          </div>
        </div>
      </div>
    </TerminalBox>
  );
}
