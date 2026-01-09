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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { fetchActivities, type Activity } from '@/lib/api';

const activityIcons: Record<string, React.ReactNode> = {
  HEARTBEAT: <Heart className="h-4 w-4 text-agora-primary" />,
  COLLECTOR: <Radio className="h-4 w-4 text-agora-success" />,
  AGENT_CHATTER: <MessageCircle className="h-4 w-4 text-agora-accent" />,
  AGENT_SUMMONED: <UserPlus className="h-4 w-4 text-agora-warning" />,
  AGORA_SESSION_START: <Play className="h-4 w-4 text-agora-primary" />,
  DECISION_PACKET: <FileText className="h-4 w-4 text-agora-success" />,
};

export function ActivityFeed() {
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
        <div
          key={activity.id}
          className="flex items-start gap-3 rounded-lg bg-agora-darker p-3 transition-colors hover:bg-agora-darker/80"
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
              {activity.payload?.message ||
                activity.payload?.agent ||
                JSON.stringify(activity.payload)}
            </p>
          </div>
          <span className="text-xs text-agora-muted whitespace-nowrap">
            {formatDistanceToNow(new Date(activity.createdAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
