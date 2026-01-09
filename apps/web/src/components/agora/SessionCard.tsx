'use client';

import { MessageSquare, Clock, CheckCircle, Loader2 } from 'lucide-react';
import type { AgoraSession } from '@/lib/api';

interface SessionCardProps {
  session: AgoraSession;
  isActive: boolean;
  onClick: () => void;
}

const statusIcons = {
  pending: <Clock className="h-4 w-4 text-agora-warning" />,
  active: <Loader2 className="h-4 w-4 text-agora-success animate-spin" />,
  concluded: <CheckCircle className="h-4 w-4 text-agora-muted" />,
};

const statusColors = {
  pending: 'border-agora-warning/30 bg-agora-warning/5',
  active: 'border-agora-success/30 bg-agora-success/5',
  concluded: 'border-agora-border bg-agora-darker',
};

export function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        isActive
          ? 'border-agora-primary bg-agora-primary/10'
          : statusColors[session.status]
      } hover:border-agora-primary/50`}
    >
      <div className="flex items-start gap-2">
        {statusIcons[session.status]}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate text-sm">
            {session.topic}
          </h4>
          <p className="mt-1 text-xs text-agora-muted">
            {new Date(session.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      {session.participants && session.participants.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-agora-muted">
          <MessageSquare className="h-3 w-3" />
          <span>{session.participants.length} agents</span>
        </div>
      )}
    </button>
  );
}
