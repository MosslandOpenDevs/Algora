'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  MessageSquare,
  Users,
  Clock,
  CheckCircle,
  Loader2,
  Calendar,
  FileText,
  Play,
  ExternalLink,
  Share2,
} from 'lucide-react';
import type { AgoraSession, Agent } from '@/lib/api';

interface SessionDetailModalProps {
  session: AgoraSession;
  agents: Agent[];
  onClose: () => void;
  onJoinSession?: () => void;
}

const statusConfig: Record<string, {
  icon: typeof Clock;
  color: string;
  bg: string;
  border: string;
  animate?: string;
}> = {
  pending: {
    icon: Clock,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
    border: 'border-agora-warning/30',
  },
  active: {
    icon: Loader2,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
    animate: 'animate-spin',
  },
  concluded: {
    icon: CheckCircle,
    color: 'text-agora-muted',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-agora-muted',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  },
};

function parseParticipants(summoned_agents: string | null): string[] {
  if (!summoned_agents) return [];
  try {
    const parsed = JSON.parse(summoned_agents);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function SessionDetailModal({ session, agents, onClose, onJoinSession }: SessionDetailModalProps) {
  const t = useTranslations('Agora');
  const [mounted, setMounted] = useState(false);
  const config = statusConfig[session.status] || statusConfig.active;
  const StatusIcon = config.icon;

  const participantIds = parseParticipants(session.summoned_agents);
  const participantAgents = agents.filter(agent =>
    participantIds.includes(agent.id) || participantIds.includes(agent.name)
  );

  const createdDate = session.created_at ? new Date(session.created_at) : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
          {/* Header */}
          <div
            className="animate-slide-up flex items-start justify-between border-b border-agora-border p-6"
            style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-start gap-4">
              <div
                className={`
                  rounded-lg border p-3 transition-transform duration-300 hover:scale-110
                  ${config.bg} ${config.border}
                `}
              >
                <StatusIcon className={`h-5 w-5 ${config.color} ${config.animate || ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
                  >
                    {t(`sessionStatus.${session.status === 'completed' ? 'concluded' : session.status}`)}
                  </span>
                  <span className="text-xs text-agora-muted">
                    Round {session.current_round}/{session.max_rounds}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 pr-8">{session.title}</h2>
                {session.description && (
                  <p className="mt-1 text-sm text-agora-muted line-clamp-2">
                    {session.description}
                  </p>
                )}
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
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Session Info Grid */}
            <div
              className="animate-slide-up grid grid-cols-2 gap-4"
              style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
            >
              {/* Started */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Calendar className="h-4 w-4" />
                  <span>{t('detail.started')}</span>
                </div>
                <p className="text-slate-900 font-medium">
                  {createdDate ? format(createdDate, 'PPpp') : 'Unknown'}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {createdDate ? formatDistanceToNow(createdDate, { addSuffix: true }) : ''}
                </p>
              </div>

              {/* Duration / Status */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Clock className="h-4 w-4" />
                  <span>{t('detail.duration')}</span>
                </div>
                <p className="text-slate-900 font-medium">
                  {session.status === 'active' && createdDate
                    ? formatDistanceToNow(createdDate)
                    : session.status === 'pending'
                      ? t('detail.notStarted')
                      : t('detail.sessionEnded')
                  }
                </p>
                <p className={`text-sm mt-1 ${
                  session.status === 'active' ? 'text-agora-success' : 'text-agora-muted'
                }`}>
                  {session.status === 'active' && t('detail.inProgress')}
                </p>
              </div>
            </div>

            {/* Participants */}
            <div
              className="animate-slide-up mt-4 rounded-lg border border-agora-border bg-agora-card p-4"
              style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-agora-muted">
                  <Users className="h-4 w-4" />
                  <span>{t('detail.participants')}</span>
                </div>
                <span className="text-sm text-slate-900 font-medium">
                  {participantIds.length} {t('detail.agents')}
                </span>
              </div>

              {participantAgents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {participantAgents.map((agent, index) => (
                    <div
                      key={agent.id}
                      className="
                        flex items-center gap-2 rounded-full bg-agora-darker px-3 py-1.5
                        transition-all duration-200 hover:scale-105 hover:bg-agora-border cursor-pointer
                      "
                      style={{
                        animationDelay: `${100 + index * 30}ms`,
                      }}
                    >
                      <div
                        className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: agent.color || '#6366f1' }}
                      >
                        {agent.display_name?.charAt(0) || agent.name.charAt(0)}
                      </div>
                      <span className="text-sm text-slate-900">
                        {agent.display_name || agent.name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : participantIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {participantIds.map((participantId) => (
                    <div
                      key={participantId}
                      className="rounded-full bg-agora-darker px-3 py-1.5 text-sm text-agora-muted"
                    >
                      {participantId}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-agora-muted italic">
                  No participants yet
                </p>
              )}
            </div>

            {/* Session Summary (for concluded sessions) */}
            {(session.status === 'concluded' || session.status === 'completed') && (
              <div
                className="animate-slide-up mt-4 rounded-lg border border-agora-border bg-agora-card p-4"
                style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
              >
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <FileText className="h-4 w-4" />
                  <span>{t('detail.summary')}</span>
                </div>
                <p className="text-slate-900 text-sm leading-relaxed">
                  {t('detail.summaryPlaceholder')}
                </p>
              </div>
            )}

            {/* Activity Stats */}
            <div
              className="animate-slide-up mt-4 grid grid-cols-3 gap-4"
              style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
            >
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 text-center transition-all hover:scale-[1.02] hover:border-agora-accent/30">
                <MessageSquare className="h-6 w-6 text-agora-accent mx-auto mb-2" />
                <p className="text-2xl font-bold text-slate-900">--</p>
                <p className="text-xs text-agora-muted">{t('detail.messages')}</p>
              </div>
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 text-center transition-all hover:scale-[1.02] hover:border-agora-primary/30">
                <Users className="h-6 w-6 text-agora-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-slate-900">{participantIds.length}</p>
                <p className="text-xs text-agora-muted">{t('detail.agents')}</p>
              </div>
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 text-center transition-all hover:scale-[1.02] hover:border-agora-warning/30">
                <Clock className="h-6 w-6 text-agora-warning mx-auto mb-2" />
                <p className="text-2xl font-bold text-slate-900">
                  {session.status !== 'pending' && createdDate
                    ? Math.round((Date.now() - createdDate.getTime()) / 60000)
                    : '--'
                  }
                </p>
                <p className="text-xs text-agora-muted">{t('detail.minutes')}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="animate-slide-up flex items-center justify-between border-t border-agora-border p-4"
            style={{ animationDelay: '250ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <span>ID: {session.id.slice(0, 8)}...</span>
            </div>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-border hover:scale-105">
                <Share2 className="h-4 w-4" />
                {t('detail.share')}
              </button>

              {session.status === 'active' && onJoinSession && (
                <button
                  onClick={onJoinSession}
                  className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-primary/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-primary/30"
                >
                  <Play className="h-4 w-4" />
                  {t('detail.joinSession')}
                </button>
              )}

              {session.status === 'pending' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-success px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-success/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-success/30">
                  <Play className="h-4 w-4" />
                  {t('detail.startSession')}
                </button>
              )}

              {(session.status === 'concluded' || session.status === 'completed') && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-border hover:scale-105">
                  <ExternalLink className="h-4 w-4" />
                  {t('detail.viewTranscript')}
                </button>
              )}
            </div>
          </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
