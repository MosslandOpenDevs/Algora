'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Radio,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  PlayCircle,
  Eye,
} from 'lucide-react';

import type { Issue } from '@/lib/api';

interface IssueCardProps {
  issue: Issue;
  index?: number;
  onClick?: () => void;
}

const statusConfig = {
  detected: {
    icon: AlertCircle,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
    border: 'border-agora-warning/30',
  },
  confirmed: {
    icon: Eye,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
  },
  in_progress: {
    icon: PlayCircle,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
    border: 'border-agora-primary/30',
  },
  resolved: {
    icon: CheckCircle,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
  },
  dismissed: {
    icon: XCircle,
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  },
};

const priorityConfig = {
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10' },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/10' },
  critical: { color: 'text-agora-error', bg: 'bg-agora-error/10' },
};

function getSignalCount(signalIds: string | null): number {
  if (!signalIds) return 0;
  try {
    const parsed = JSON.parse(signalIds);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function IssueCard({ issue, index = 0, onClick }: IssueCardProps) {
  const t = useTranslations('Issues');
  const config = statusConfig[issue.status] || statusConfig.detected;
  const StatusIcon = config.icon;
  const signalCount = getSignalCount(issue.signal_ids);

  // Calculate stagger delay
  const delayMs = Math.min(index * 50, 400);

  // Check if high priority
  const isHighPriority = issue.priority === 'high' || issue.priority === 'critical';

  // Check if recently updated (within last hour)
  const isRecentlyUpdated = Date.now() - new Date(issue.updated_at).getTime() < 60 * 60 * 1000;

  return (
    <div
      onClick={onClick}
      className={`
        relative group cursor-pointer rounded-lg border bg-agora-card p-5
        animate-slide-up
        transition-all duration-300
        hover:shadow-lg hover:scale-[1.02] hover:border-agora-primary/50
        ${isHighPriority ? 'border-l-4 border-l-agora-error ' + config.border : config.border}
        ${isHighPriority && !['resolved', 'dismissed'].includes(issue.status) ? 'ring-2 ring-agora-error/30' : ''}
      `}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'backwards',
      }}
    >
      {/* Recently Updated Badge */}
      {isRecentlyUpdated && (
        <span className="absolute -top-2 -right-2 rounded-full bg-agora-success px-2 py-0.5 text-[10px] font-bold text-slate-900 animate-bounce-in">
          UPDATED
        </span>
      )}

      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div
          className={`
            rounded-lg p-2 transition-all duration-300
            group-hover:scale-110
            ${config.bg}
          `}
        >
          <StatusIcon className={`h-5 w-5 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900 group-hover:text-agora-primary transition-colors">
                {issue.title}
              </h3>
              <p className="mt-1 text-sm text-agora-muted line-clamp-2">
                {issue.description}
              </p>
            </div>

            {/* Priority Badge */}
            <div
              className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityConfig[issue.priority].bg} ${priorityConfig[issue.priority].color}`}
            >
              {t(`priority.${issue.priority}`)}
            </div>
          </div>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
            {/* Status */}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${config.bg} ${config.color}`}
            >
              <StatusIcon className="h-3 w-3" />
              {t(`status.${issue.status}`)}
            </span>

            {/* Category */}
            {issue.category && (
              <span className="flex items-center gap-1 text-agora-muted capitalize">
                {issue.category}
              </span>
            )}

            {/* Signals */}
            {signalCount > 0 && (
              <span className="flex items-center gap-1 text-agora-muted">
                <Radio className="h-3 w-3" />
                {signalCount} {t('signals')}
              </span>
            )}

            {/* Updated */}
            <span className="flex items-center gap-1 text-agora-muted">
              <Clock className="h-3 w-3" />
              {t('updated')} {formatDistanceToNow(new Date(issue.updated_at), { addSuffix: true })}
            </span>

            {/* View Details */}
            <span className="ml-auto flex items-center gap-1 text-agora-primary opacity-0 transition-opacity group-hover:opacity-100">
              {t('viewDetails')}
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
