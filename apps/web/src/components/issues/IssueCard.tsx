'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  MessageSquare,
  Radio,
  CheckCircle,
  Clock,
  Vote,
  XCircle,
  ArrowRight,
} from 'lucide-react';

interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'discussing' | 'voting' | 'resolved' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'critical';
  signalCount: number;
  commentCount: number;
  created_at: string;
  updated_at: string;
}

interface IssueCardProps {
  issue: Issue;
  onClick?: () => void;
}

const statusConfig = {
  open: {
    icon: AlertCircle,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
    border: 'border-agora-warning/30',
  },
  discussing: {
    icon: MessageSquare,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
  },
  voting: {
    icon: Vote,
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
  rejected: {
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

export function IssueCard({ issue, onClick }: IssueCardProps) {
  const t = useTranslations('Issues');
  const StatusIcon = statusConfig[issue.status].icon;

  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-lg border bg-agora-card p-5 transition-all hover:shadow-lg hover:bg-agora-card/80 ${statusConfig[issue.status].border}`}
    >
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={`rounded-lg p-2 ${statusConfig[issue.status].bg}`}>
          <StatusIcon className={`h-5 w-5 ${statusConfig[issue.status].color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white group-hover:text-agora-primary transition-colors">
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
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${statusConfig[issue.status].bg} ${statusConfig[issue.status].color}`}
            >
              <StatusIcon className="h-3 w-3" />
              {t(`status.${issue.status}`)}
            </span>

            {/* Signals */}
            <span className="flex items-center gap-1 text-agora-muted">
              <Radio className="h-3 w-3" />
              {issue.signalCount} {t('signals')}
            </span>

            {/* Comments */}
            <span className="flex items-center gap-1 text-agora-muted">
              <MessageSquare className="h-3 w-3" />
              {issue.commentCount} {t('comments')}
            </span>

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
