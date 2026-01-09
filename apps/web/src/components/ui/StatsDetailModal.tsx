'use client';

import { useTranslations } from 'next-intl';
import { X, TrendingUp, TrendingDown, Activity, Clock, BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchActivities, type Activity as ActivityType } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

export interface StatInfo {
  key: string;
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  description?: string;
  relatedActivityTypes?: string[];
}

interface StatsDetailModalProps {
  stat: StatInfo;
  onClose: () => void;
}

export function StatsDetailModal({ stat, onClose }: StatsDetailModalProps) {
  const t = useTranslations('Dashboard');

  // Fetch related activities
  const { data: activities } = useQuery({
    queryKey: ['activities', 'stats', stat.key],
    queryFn: () => fetchActivities(50),
    select: (data) => {
      if (stat.relatedActivityTypes && stat.relatedActivityTypes.length > 0) {
        return data.filter((a: ActivityType) =>
          stat.relatedActivityTypes!.includes(a.type)
        ).slice(0, 10);
      }
      return data.slice(0, 10);
    },
  });

  // Mock breakdown data based on stat key
  const getBreakdown = () => {
    switch (stat.key) {
      case 'activeAgents':
        return [
          { label: 'Visionaries', value: 5, color: 'bg-purple-500' },
          { label: 'Builders', value: 4, color: 'bg-blue-500' },
          { label: 'Investors', value: 5, color: 'bg-green-500' },
          { label: 'Guardians', value: 4, color: 'bg-red-500' },
          { label: 'Operatives', value: 4, color: 'bg-yellow-500' },
        ];
      case 'activeSessions':
        return [
          { label: 'Security', value: 3, color: 'bg-red-500' },
          { label: 'Market', value: 4, color: 'bg-green-500' },
          { label: 'Governance', value: 1, color: 'bg-purple-500' },
        ];
      case 'signalsToday':
        return [
          { label: 'RSS Feeds', value: 45, color: 'bg-blue-500' },
          { label: 'GitHub', value: 23, color: 'bg-gray-500' },
          { label: 'Blockchain', value: 32, color: 'bg-yellow-500' },
        ];
      case 'openIssues':
        return [
          { label: 'Critical', value: 2, color: 'bg-red-500' },
          { label: 'High', value: 4, color: 'bg-orange-500' },
          { label: 'Medium', value: 3, color: 'bg-yellow-500' },
          { label: 'Low', value: 1, color: 'bg-green-500' },
        ];
      default:
        return [];
    }
  };

  const breakdown = getBreakdown();
  const total = breakdown.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-scale-in relative w-full max-w-lg mx-4 rounded-xl border border-agora-border bg-agora-dark shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-agora-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-card">
              {stat.icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{stat.title}</h2>
              <p className="text-sm text-agora-muted">{t('statDetails')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          {/* Current Value */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-agora-muted">{t('currentValue')}</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
              </div>
              {stat.trend !== undefined && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    stat.trend > 0
                      ? 'bg-green-500/20 text-green-400'
                      : stat.trend < 0
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {stat.trend > 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : stat.trend < 0 ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : (
                    <Activity className="h-5 w-5" />
                  )}
                  <span className="text-lg font-semibold">
                    {stat.trend > 0 ? '+' : ''}
                    {stat.trend}%
                  </span>
                </div>
              )}
            </div>
            {stat.description && (
              <p className="text-sm text-agora-muted mt-3">{stat.description}</p>
            )}
          </div>

          {/* Breakdown */}
          {breakdown.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-3">
                <BarChart3 className="h-4 w-4" />
                {t('breakdown')}
              </h3>
              <div className="space-y-3">
                {/* Progress bar */}
                <div className="flex h-3 rounded-full overflow-hidden bg-agora-darker">
                  {breakdown.map((item, i) => (
                    <div
                      key={i}
                      className={`${item.color} transition-all duration-500`}
                      style={{ width: `${(item.value / total) * 100}%` }}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2">
                  {breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-agora-darker p-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${item.color}`} />
                        <span className="text-sm text-agora-muted">{item.label}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Related Activities */}
          {activities && activities.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-3">
                <Clock className="h-4 w-4" />
                {t('recentActivity')}
              </h3>
              <div className="space-y-2">
                {activities.map((activity: ActivityType) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between rounded-lg bg-agora-darker p-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 truncate">{activity.message}</p>
                      <p className="text-xs text-agora-muted">{activity.type}</p>
                    </div>
                    <span className="text-xs text-agora-muted whitespace-nowrap ml-2">
                      {formatDistanceToNow(new Date(activity.timestamp || activity.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-agora-border p-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-agora-card py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
