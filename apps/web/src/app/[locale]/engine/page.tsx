'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Settings,
  Activity,
  Wallet,
  Clock,
  Cpu,
  Database,
  Zap,
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

import { BudgetCard } from '@/components/engine/BudgetCard';
import { TierUsageCard } from '@/components/engine/TierUsageCard';
import { SchedulerCard } from '@/components/engine/SchedulerCard';
import { SystemHealthCard } from '@/components/engine/SystemHealthCard';

export default function EngineRoomPage() {
  const t = useTranslations('Engine');

  const { data: health, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201'}/health`
      );
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Mock additional data
  const budgetData = {
    daily: {
      limit: 10.0,
      spent: 3.45,
      remaining: 6.55,
    },
    monthly: {
      limit: 200.0,
      spent: 67.89,
      remaining: 132.11,
    },
  };

  const tierUsage = {
    tier0: { calls: 1234, label: 'Free Operations' },
    tier1: { calls: 456, label: 'Local LLM' },
    tier2: { calls: 23, label: 'External LLM' },
  };

  const schedulerData = {
    nextTier2: health?.scheduler?.nextTier2 || new Date(Date.now() + 3600000).toISOString(),
    queueLength: health?.scheduler?.queueLength || 5,
    lastRun: new Date(Date.now() - 180000).toISOString(),
    interval: 3,
  };

  const systemHealth = {
    status: health?.status || 'running',
    uptime: health?.uptime || 12345,
    memory: 512,
    dbSize: 24.5,
    agents: {
      total: 30,
      active: 5,
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-white transition-colors hover:bg-agora-border"
        >
          <RefreshCw className="h-4 w-4" />
          {t('refresh')}
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
          <p className="font-medium text-white">
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
          <p className="mt-2 text-2xl font-bold text-white">
            {(tierUsage.tier0.calls + tierUsage.tier1.calls + tierUsage.tier2.calls).toLocaleString()}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.today')}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Cpu className="h-4 w-4" />
            <span className="text-sm">{t('stats.llmCalls')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {(tierUsage.tier1.calls + tierUsage.tier2.calls).toLocaleString()}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.today')}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Database className="h-4 w-4" />
            <span className="text-sm">{t('stats.dbSize')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{systemHealth.dbSize} MB</p>
          <p className="text-xs text-agora-muted">SQLite WAL</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">{t('stats.activeAgents')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {systemHealth.agents.active}/{systemHealth.agents.total}
          </p>
          <p className="text-xs text-agora-muted">{t('stats.agents')}</p>
        </div>
      </div>
    </div>
  );
}
