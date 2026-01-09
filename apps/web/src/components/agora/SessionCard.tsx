'use client';

import { Clock, CheckCircle, Loader2, Info, Users } from 'lucide-react';
import type { AgoraSession } from '@/lib/api';

interface SessionCardProps {
  session: AgoraSession;
  isActive: boolean;
  index?: number;
  onClick: () => void;
  onDetailClick?: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-agora-warning" />,
  active: <Loader2 className="h-4 w-4 text-agora-success animate-spin" />,
  concluded: <CheckCircle className="h-4 w-4 text-agora-muted" />,
  completed: <CheckCircle className="h-4 w-4 text-agora-muted" />,
};

const statusColors: Record<string, string> = {
  pending: 'border-agora-warning/30 bg-agora-warning/5',
  active: 'border-agora-success/30 bg-agora-success/5',
  concluded: 'border-agora-border bg-agora-darker',
  completed: 'border-agora-border bg-agora-darker',
};

function getParticipantCount(summoned_agents: string | null): number {
  if (!summoned_agents) return 0;
  try {
    const parsed = JSON.parse(summoned_agents);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function SessionCard({ session, isActive, index = 0, onClick, onDetailClick }: SessionCardProps) {
  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDetailClick?.();
  };

  const participantCount = getParticipantCount(session.summoned_agents);
  const progressPercentage = session.max_rounds > 0 ? (session.current_round / session.max_rounds) * 100 : 0;
  const isActiveSession = session.status === 'active';

  // Calculate stagger delay
  const delayMs = Math.min(index * 50, 400);

  return (
    <button
      onClick={onClick}
      className={`
        group w-full rounded-lg border p-3 text-left
        animate-slide-up
        transition-all duration-300
        hover:shadow-md hover:border-agora-primary/50 hover:-translate-y-0.5
        ${isActive
          ? 'border-agora-primary bg-agora-primary/10 ring-2 ring-agora-primary/30'
          : statusColors[session.status] || statusColors.active
        }
        ${isActiveSession && !isActive ? 'ring-2 ring-agora-primary/30' : ''}
      `}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div className="flex items-start gap-2">
        <div className={`transition-transform duration-300 ${isActiveSession ? 'scale-110' : ''}`}>
          {statusIcons[session.status] || statusIcons.active}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-900 truncate text-sm group-hover:text-agora-primary transition-colors">
            {session.title}
          </h4>
          <p className="mt-1 text-xs text-agora-muted">
            {session.created_at ? new Date(session.created_at).toLocaleDateString() : 'No date'}
          </p>
        </div>
        {onDetailClick && (
          <button
            onClick={handleDetailClick}
            className="opacity-0 group-hover:opacity-100 rounded p-1 text-agora-muted hover:bg-agora-border hover:text-slate-900 transition-all"
            title="View details"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mt-2 h-1 rounded-full bg-agora-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            session.status === 'concluded' || session.status === 'completed'
              ? 'bg-agora-success'
              : isActiveSession
                ? 'bg-agora-primary'
                : 'bg-agora-warning'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-agora-muted">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {participantCount} agents
        </span>
        <span>Round {session.current_round}/{session.max_rounds}</span>
      </div>
    </button>
  );
}
