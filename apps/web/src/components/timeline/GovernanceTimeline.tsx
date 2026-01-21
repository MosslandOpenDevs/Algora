'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Radio,
  AlertTriangle,
  FileText,
  MessageSquare,
  Vote,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { cn, safeFormatDate } from '@/lib/utils';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

// Types
interface TimelineEvent {
  id: string;
  type: 'signal' | 'issue' | 'agora_session' | 'proposal' | 'vote' | 'execution';
  timestamp: string;
  title: string;
  description: string;
  status?: string;
  metadata: Record<string, unknown>;
  linkedId?: string;
}

interface TimelineResponse {
  events: TimelineEvent[];
  count: number;
  issueId?: string;
  issue?: {
    id: string;
    title: string;
    status: string;
    category: string;
    priority: string;
  };
}

// Event type configuration
const eventConfig: Record<TimelineEvent['type'], {
  icon: typeof Radio;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  signal: {
    icon: Radio,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Signal',
  },
  issue: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
    label: 'Issue',
  },
  agora_session: {
    icon: MessageSquare,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    label: 'Agora',
  },
  proposal: {
    icon: FileText,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    label: 'Proposal',
  },
  vote: {
    icon: Vote,
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    label: 'Vote',
  },
  execution: {
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Execution',
  },
};

// Get vote icon based on choice
function getVoteIcon(choice: string) {
  switch (choice) {
    case 'for':
      return CheckCircle;
    case 'against':
      return XCircle;
    default:
      return Vote;
  }
}

// Get vote color based on choice
function getVoteColor(choice: string) {
  switch (choice) {
    case 'for':
      return 'text-green-600 dark:text-green-400';
    case 'against':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}

interface TimelineEventCardProps {
  event: TimelineEvent;
  isLast: boolean;
  compact?: boolean;
}

function TimelineEventCard({ event, isLast, compact = false }: TimelineEventCardProps) {
  const t = useTranslations('Timeline');
  const config = eventConfig[event.type];
  const Icon = event.type === 'vote' && event.status
    ? getVoteIcon(event.status)
    : config.icon;
  const iconColor = event.type === 'vote' && event.status
    ? getVoteColor(event.status)
    : config.color;

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
      )}

      {/* Event icon */}
      <div
        className={cn(
          'relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2',
          config.bgColor,
          config.borderColor
        )}
      >
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>

      {/* Event content */}
      <div className={cn('flex-1 pb-6', compact ? 'pb-4' : 'pb-6')}>
        <div
          className={cn(
            'rounded-lg border p-4',
            config.bgColor,
            config.borderColor
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-medium uppercase tracking-wide',
                    config.color
                  )}
                >
                  {config.label}
                </span>
                {event.status && (
                  <span className="rounded-full bg-white/50 dark:bg-black/20 px-2 py-0.5 text-xs">
                    {event.status}
                  </span>
                )}
              </div>
              <h4 className="mt-1 font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                {event.title}
              </h4>
              {!compact && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {safeFormatDate(new Date(event.timestamp), d =>
                  formatDistanceToNow(d, { addSuffix: true })
                )}
              </span>
            </div>
          </div>

          {/* Metadata badges */}
          {!compact && event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {event.metadata.category != null && (
                <span className="rounded bg-white/50 dark:bg-black/20 px-2 py-0.5 text-xs">
                  {String(event.metadata.category)}
                </span>
              )}
              {event.metadata.priority != null && (
                <span className="rounded bg-white/50 dark:bg-black/20 px-2 py-0.5 text-xs">
                  {String(event.metadata.priority)}
                </span>
              )}
              {event.metadata.source != null && (
                <span className="rounded bg-white/50 dark:bg-black/20 px-2 py-0.5 text-xs">
                  {String(event.metadata.source)}
                </span>
              )}
              {event.metadata.weight != null && (
                <span className="rounded bg-white/50 dark:bg-black/20 px-2 py-0.5 text-xs">
                  Weight: {String(event.metadata.weight)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface GovernanceTimelineProps {
  issueId?: string;
  proposalId?: string;
  limit?: number;
  compact?: boolean;
  showStats?: boolean;
}

export function GovernanceTimeline({
  issueId,
  proposalId,
  limit = 20,
  compact = false,
  showStats = false,
}: GovernanceTimelineProps) {
  const t = useTranslations('Timeline');

  // Determine endpoint
  const endpoint = issueId
    ? `${API_URL}/api/timeline/issue/${issueId}`
    : proposalId
      ? `${API_URL}/api/timeline/proposal/${proposalId}`
      : `${API_URL}/api/timeline?limit=${limit}`;

  const { data, isLoading, error } = useQuery<TimelineResponse>({
    queryKey: ['timeline', issueId, proposalId, limit],
    queryFn: async () => {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['timeline-stats'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/timeline/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: showStats,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {t('error')}
      </div>
    );
  }

  return (
    <div>
      {/* Issue header */}
      {data.issue && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                {t('issue')}
              </span>
              <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {data.issue.title}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">
                  {data.issue.category}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">
                  {data.issue.priority}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">
                  {data.issue.status}
                </span>
              </div>
            </div>
            <Link
              href={`/issues?id=${data.issue.id}`}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              {t('viewDetails')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Stats overview */}
      {showStats && stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <Radio className="h-5 w-5 text-blue-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totals.signals}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('signals')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totals.issues}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('issues')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <FileText className="h-5 w-5 text-indigo-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totals.proposals}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('proposals')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <Vote className="h-5 w-5 text-cyan-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totals.votes}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('votes')}</p>
          </div>
        </div>
      )}

      {/* Flow visualization (horizontal stages) */}
      {!issueId && !proposalId && (
        <div className="mb-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
          {(['signal', 'issue', 'agora_session', 'proposal', 'vote', 'execution'] as const).map((type, i, arr) => {
            const config = eventConfig[type];
            const Icon = config.icon;
            return (
              <div key={type} className="flex items-center">
                <div className={cn('flex items-center gap-2 rounded-full px-3 py-1.5', config.bgColor, config.borderColor, 'border')}>
                  <Icon className={cn('h-4 w-4', config.color)} />
                  <span className={cn('text-sm font-medium', config.color)}>
                    {config.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight className="mx-1 h-4 w-4 text-gray-400" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline events */}
      {data.events.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <Clock className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">{t('noEvents')}</p>
        </div>
      ) : (
        <div className="space-y-0">
          {data.events.map((event, index) => (
            <TimelineEventCard
              key={event.id}
              event={event}
              isLast={index === data.events.length - 1}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Show more link */}
      {data.events.length === limit && (
        <div className="mt-4 text-center">
          <Link
            href="/timeline"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {t('viewAll')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
