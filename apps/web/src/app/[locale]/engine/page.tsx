'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Cpu,
  Database,
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Check,
} from 'lucide-react';

import { BudgetCard } from '@/components/engine/BudgetCard';
import { TierUsageCard } from '@/components/engine/TierUsageCard';
import { SchedulerCard } from '@/components/engine/SchedulerCard';
import { SystemHealthCard } from '@/components/engine/SystemHealthCard';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

export default function EngineRoomPage() {
  const t = useTranslations('Engine');
  const tGuide = useTranslations('Guide.tooltips');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: health, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201'}/health`
      );
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Fetch tier usage stats
  const { data: tierStats } = useQuery({
    queryKey: ['tier-stats'],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201'}/api/stats/tier-usage`
      );
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Use real data from health endpoint, with fallbacks
  const budgetData = {
    daily: {
      limit: health?.budget?.daily || 25.0,
      spent: health?.budget?.spent || 0,
      remaining: health?.budget?.remaining || 25.0,
    },
    monthly: {
      limit: (health?.budget?.daily || 25.0) * 30,
      spent: (health?.budget?.spent || 0) * 30, // Estimate
      remaining: (health?.budget?.remaining || 25.0) * 30,
    },
  };

  const tierUsage = {
    tier0: { calls: tierStats?.tier0 || 0, label: 'Free Operations' },
    tier1: { calls: tierStats?.tier1 || 0, label: 'Local LLM' },
    tier2: { calls: tierStats?.tier2 || 0, label: 'External LLM' },
  };

  const schedulerData = {
    nextTier2: health?.scheduler?.nextTier2 || null,
    queueLength: health?.scheduler?.queueLength || 0,
    lastRun: null,
    interval: 6, // Hours between Tier2 runs
    tier2Hours: health?.scheduler?.tier2Hours || [6, 12, 18, 23],
  };

  const systemHealth = {
    status: health?.status === 'ok' ? 'running' : health?.status || 'running',
    uptime: health?.uptime || 0,
    memory: 512, // Would need system metrics API
    dbSize: 24.5, // Would need file stats API
    agents: {
      total: health?.agents?.total || 30,
      active: health?.agents?.active || 0,
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('engine')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={async () => {
            setIsRefreshing(true);
            setShowSuccess(false);
            await refetch();
            setIsRefreshing(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
          }}
          disabled={isRefreshing || isFetching}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
            showSuccess
              ? 'bg-agora-success/20 text-agora-success'
              : 'bg-agora-card text-slate-900 hover:bg-agora-border'
          } disabled:opacity-50`}
        >
          {showSuccess ? (
            <>
              <Check className="h-4 w-4" />
              {t('refreshed') || 'Refreshed'}
            </>
          ) : (
            <>
              <RefreshCw className={`h-4 w-4 ${(isRefreshing || isFetching) ? 'animate-spin' : ''}`} />
              {t('refresh')}
            </>
          )}
        </button>
      </div>

      {/* System Status Banner */}
      <div
        className={`flex items-center gap-3 rounded-lg border p-4 ${
          systemHealth.status === 'running'
            ? 'border-agora-success/30 bg-agora-success/5'
            : systemHealth.status === 'degraded'
              ? 'border-agora-warning/30 bg-agora-warning/5'
              : 'border-agora-error/30 bg-agora-error/5'
        }`}
      >
        {systemHealth.status === 'running' ? (
          <CheckCircle className="h-5 w-5 text-agora-success" />
        ) : systemHealth.status === 'degraded' ? (
          <AlertTriangle className="h-5 w-5 text-agora-warning" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-agora-error" />
        )}
        <div>
          <p className="font-medium text-slate-900">
            {t(`status.${systemHealth.status}`)}
          </p>
          <p className="text-sm text-agora-muted">
            {t('uptime')}: {Math.floor(systemHealth.uptime / 3600)}h {Math.floor((systemHealth.uptime % 3600) / 60)}m
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Budget Section */}
        <BudgetCard budget={budgetData} />

        {/* Tier Usage */}
        <TierUsageCard usage={tierUsage} />

        {/* Scheduler */}
        <SchedulerCard scheduler={schedulerData} />

        {/* System Health */}
        <SystemHealthCard health={systemHealth} />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Server className="h-4 w-4" />
            <span className="text-sm">{t('stats.apiCalls')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {(tierUsage.tier0.calls + tierUsage.tier1.calls + tierUsage.tier2.calls).toLocaleString()}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.today')}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Cpu className="h-4 w-4" />
            <span className="text-sm">{t('stats.llmCalls')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {(tierUsage.tier1.calls + tierUsage.tier2.calls).toLocaleString()}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.today')}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Database className="h-4 w-4" />
            <span className="text-sm">{t('stats.dbSize')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{systemHealth.dbSize} MB</p>
          <p className="text-xs text-agora-muted">SQLite WAL</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">{t('stats.activeAgents')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {systemHealth.agents.active}/{systemHealth.agents.total}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.agents')}</p>
        </div>
      </div>
    </div>
  );
}
