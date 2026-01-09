'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { fetchActivities, type Activity } from '@/lib/api';

interface ActivityFeedProps {
  onActivityClick?: (activity: Activity) => void;
}

const activityIcons: Record<string, React.ReactNode> = {
  HEARTBEAT: <Heart className="h-4 w-4 text-agora-primary" />,
  COLLECTOR: <Radio className="h-4 w-4 text-agora-success" />,
  AGENT_CHATTER: <MessageCircle className="h-4 w-4 text-agora-accent" />,
  AGENT_SUMMONED: <UserPlus className="h-4 w-4 text-agora-warning" />,
  AGORA_SESSION_START: <Play className="h-4 w-4 text-agora-primary" />,
  AGORA_SESSION_AUTO_CREATED: <Zap className="h-4 w-4 text-agora-warning" />,
  DECISION_PACKET: <FileText className="h-4 w-4 text-agora-success" />,
  ISSUE_DETECTED: <AlertTriangle className="h-4 w-4 text-agora-warning" />,
  VOTE_CAST: <Vote className="h-4 w-4 text-agora-accent" />,
  VOTING_FINALIZED: <CheckCircle className="h-4 w-4 text-agora-success" />,
  DELEGATION_CREATED: <Users className="h-4 w-4 text-agora-primary" />,
  PROPOSAL_CREATED: <Lightbulb className="h-4 w-4 text-agora-warning" />,
  VOTING_STARTED: <Play className="h-4 w-4 text-agora-accent" />,
  DECISION_PACKET_GENERATED: <FileText className="h-4 w-4 text-agora-primary" />,
  SYSTEM_STATUS: <ActivityIcon className="h-4 w-4 text-agora-muted" />,
  PROPOSAL_OUTCOME_PROCESSED: <Target className="h-4 w-4 text-agora-success" />,
  OUTCOME_CREATED: <Target className="h-4 w-4 text-agora-primary" />,
  EXECUTION_STARTED: <Loader className="h-4 w-4 text-agora-warning" />,
  EXECUTION_COMPLETED: <CheckCircle className="h-4 w-4 text-agora-success" />,
  OUTCOME_COMPLETED: <Trophy className="h-4 w-4 text-agora-success" />,
};

export function ActivityFeed({ onActivityClick }: ActivityFeedProps) {
  const t = useTranslations('Activity.types');

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities'],
    queryFn: () => fetchActivities(15),
    refetchInterval: 5000,
  });

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

  return (
    <div className="space-y-2">
      {activities.map((activity: Activity) => (
        <button
          key={activity.id}
          onClick={() => onActivityClick?.(activity)}
          className="flex w-full items-start gap-3 rounded-lg bg-agora-darker p-3 text-left transition-colors hover:bg-agora-darker/80 hover:ring-1 hover:ring-agora-border"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-agora-card">
            {activityIcons[activity.type] || (
              <Heart className="h-4 w-4 text-agora-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">
              {t(activity.type as keyof typeof activityIcons)}
            </p>
            <p className="text-xs text-agora-muted truncate">
              {activity.message || activity.details || ''}
            </p>
          </div>
          <span className="text-xs text-agora-muted whitespace-nowrap">
            {formatDistanceToNow(new Date(activity.timestamp || activity.created_at), {
              addSuffix: true,
            })}
          </span>
        </button>
      ))}
    </div>
  );
}
