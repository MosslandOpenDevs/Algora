'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Radio,
  MessageCircle,
  UserPlus,
  Play,
  FileText,
  AlertTriangle,
  Vote,
  CheckCircle,
  Users,
  Lightbulb,
  Activity as ActivityIcon,
  Target,
  Loader,
  Trophy,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { fetchActivities, type Activity } from '@/lib/api';

interface ActivityFeedProps {
  onActivityClick?: (activity: Activity) => void;
}

const activityIcons: Record<string, React.ReactNode> = {
  HEARTBEAT: <Heart className="h-4 w-4 text-blue-400" />,
  COLLECTOR: <Radio className="h-4 w-4 text-green-400" />,
  AGENT_CHATTER: <MessageCircle className="h-4 w-4 text-purple-400" />,
  AGENT_SUMMONED: <UserPlus className="h-4 w-4 text-yellow-400" />,
  AGORA_SESSION_START: <Play className="h-4 w-4 text-blue-400" />,
  AGORA_SESSION_AUTO_CREATED: <Zap className="h-4 w-4 text-yellow-400" />,
  DECISION_PACKET: <FileText className="h-4 w-4 text-green-400" />,
  ISSUE_DETECTED: <AlertTriangle className="h-4 w-4 text-orange-400" />,
  VOTE_CAST: <Vote className="h-4 w-4 text-purple-400" />,
  VOTING_FINALIZED: <CheckCircle className="h-4 w-4 text-green-400" />,
  DELEGATION_CREATED: <Users className="h-4 w-4 text-blue-400" />,
  PROPOSAL_CREATED: <Lightbulb className="h-4 w-4 text-yellow-400" />,
  VOTING_STARTED: <Play className="h-4 w-4 text-purple-400" />,
  DECISION_PACKET_GENERATED: <FileText className="h-4 w-4 text-blue-400" />,
  SYSTEM_STATUS: <ActivityIcon className="h-4 w-4 text-gray-400" />,
  PROPOSAL_OUTCOME_PROCESSED: <Target className="h-4 w-4 text-green-400" />,
  OUTCOME_CREATED: <Target className="h-4 w-4 text-blue-400" />,
  EXECUTION_STARTED: <Loader className="h-4 w-4 text-yellow-400 animate-spin" />,
  EXECUTION_COMPLETED: <CheckCircle className="h-4 w-4 text-green-400" />,
  OUTCOME_COMPLETED: <Trophy className="h-4 w-4 text-green-400" />,
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function ActivityFeed({ onActivityClick }: ActivityFeedProps) {
  const t = useTranslations('Activity.types');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevActivitiesRef = useRef<string[]>([]);

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities'],
    queryFn: () => fetchActivities(25),
    refetchInterval: 10000,
  });

  // Track new activities for animation
  useEffect(() => {
    if (activities) {
      const currentIds = activities.map((a: Activity) => a.id);
      const prevIds = prevActivitiesRef.current;
      const newActivityIds = currentIds.filter((id: string) => !prevIds.includes(id));

      if (newActivityIds.length > 0 && prevIds.length > 0) {
        setNewIds(new Set(newActivityIds));
        // Remove highlight after animation
        setTimeout(() => setNewIds(new Set()), 2000);
      }

      prevActivitiesRef.current = currentIds;
    }
  }, [activities]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-start gap-3 rounded-lg bg-agora-darker p-3"
          >
            <div className="h-8 w-8 rounded-full bg-agora-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-agora-border" />
              <div className="h-3 w-1/2 rounded bg-agora-border" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <div className="py-8 text-center text-agora-muted">
        No recent activity
      </div>
    );
  }

  // Parse metadata safely
  const parseMetadata = (activity: Activity) => {
    if (!activity.metadata) return null;
    try {
      return typeof activity.metadata === 'string'
        ? JSON.parse(activity.metadata)
        : activity.metadata;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-2">
      {activities.map((activity: Activity) => {
        const isNew = newIds.has(activity.id);
        const metadata = parseMetadata(activity);

        return (
          <button
            key={activity.id}
            onClick={() => onActivityClick?.(activity)}
            className={`
              group flex w-full items-start gap-3 rounded-lg bg-agora-darker p-3 text-left
              transition-all duration-200 hover:bg-agora-card hover:scale-[1.01] hover:shadow-lg
              ${isNew ? 'animate-slide-in-right animate-highlight' : ''}
            `}
          >
            {/* Icon */}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-agora-card group-hover:bg-agora-border transition-colors">
              {activityIcons[activity.type] || (
                <Heart className="h-4 w-4 text-gray-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header row: Type + Severity */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-slate-900">
                  {t(activity.type as keyof typeof activityIcons)}
                </p>
                {activity.severity && activity.severity !== 'info' && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${severityColors[activity.severity] || severityColors.info}`}>
                    {activity.severity.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Message */}
              <p className="text-xs text-agora-muted mt-0.5 line-clamp-2">
                {activity.message || activity.details || ''}
              </p>

              {/* Agent info if available */}
              {activity.agent_id && (
                <p className="text-[10px] text-purple-400 mt-1">
                  Agent: {activity.agent_id}
                </p>
              )}

              {/* Metadata summary */}
              {metadata && Object.keys(metadata).length > 0 && (
                <div className="flex items-center gap-2 mt-1 text-[10px] text-agora-muted">
                  {metadata.uptime && (
                    <span>Uptime: {Math.floor(metadata.uptime / 60)}m</span>
                  )}
                  {metadata.memory && (
                    <span>Memory: {Math.floor(metadata.memory / 1024 / 1024)}MB</span>
                  )}
                  {metadata.sessionId && (
                    <span>Session: {metadata.sessionId.slice(0, 8)}...</span>
                  )}
                </div>
              )}
            </div>

            {/* Time + Arrow */}
            <div className="flex items-center gap-1 text-xs text-agora-muted whitespace-nowrap">
              <span>
                {formatDistanceToNow(new Date(activity.timestamp || activity.created_at), {
                  addSuffix: true,
                })}
              </span>
              <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
