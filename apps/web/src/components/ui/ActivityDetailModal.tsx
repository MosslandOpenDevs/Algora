'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  Heart,
  Radio,
  MessageCircle,
  UserPlus,
  UserMinus,
  Play,
  FileText,
  Calendar,
  Clock,
  AlertCircle,
  Database,
  Tag,
} from 'lucide-react';
import type { Activity } from '@/lib/api';

interface ActivityDetailModalProps {
  activity: Activity;
  onClose: () => void;
}

const activityIcons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  HEARTBEAT: {
    icon: <Heart className="h-5 w-5" />,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
  },
  COLLECTOR: {
    icon: <Radio className="h-5 w-5" />,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
  },
  AGENT_CHATTER: {
    icon: <MessageCircle className="h-5 w-5" />,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
  },
  AGENT_SUMMONED: {
    icon: <UserPlus className="h-5 w-5" />,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
  },
  AGENT_DISMISSED: {
    icon: <UserMinus className="h-5 w-5" />,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
  },
  AGORA_SESSION_START: {
    icon: <Play className="h-5 w-5" />,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
  },
  DECISION_PACKET: {
    icon: <FileText className="h-5 w-5" />,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
  },
};

const severityConfig: Record<string, { color: string; bg: string }> = {
  info: { color: 'text-blue-400', bg: 'bg-blue-500/10' },
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10' },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10' },
  critical: { color: 'text-agora-error', bg: 'bg-agora-error/10' },
};

export function ActivityDetailModal({ activity, onClose }: ActivityDetailModalProps) {
  const t = useTranslations('Activity');
  const [mounted, setMounted] = useState(false);
  const activityConfig = activityIcons[activity.type] || {
    icon: <Heart className="h-5 w-5" />,
    color: 'text-agora-muted',
    bg: 'bg-agora-muted/10',
  };
  const severityStyle = severityConfig[activity.severity] || severityConfig.info;

  const timestamp = activity.timestamp || activity.created_at;

  // Parse metadata if it exists
  let parsedMetadata: Record<string, unknown> | null = null;
  if (activity.metadata) {
    try {
      parsedMetadata = typeof activity.metadata === 'string'
        ? JSON.parse(activity.metadata)
        : activity.metadata;
    } catch {
      // Keep as null if parsing fails
    }
  }

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
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-agora-border p-6">
            <div className="flex items-start gap-4">
              <div className={`rounded-lg p-3 ${activityConfig.bg}`}>
                <span className={activityConfig.color}>
                  {activityConfig.icon}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {t(`types.${activity.type}`)}
                </h2>
                <p className="mt-1 text-sm text-agora-muted">
                  {t('detail.activityId')}: {activity.id}
                </p>
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
            {/* Severity & Timestamp */}
            <div className="grid grid-cols-2 gap-4">
              {/* Severity */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <AlertCircle className="h-4 w-4" />
                  <span>{t('detail.severity')}</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${severityStyle.bg} ${severityStyle.color}`}>
                  {activity.severity}
                </span>
              </div>

              {/* Timestamp */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Calendar className="h-4 w-4" />
                  <span>{t('detail.timestamp')}</span>
                </div>
                <p className="text-slate-900 font-medium text-sm">
                  {format(new Date(timestamp), 'PPp')}
                </p>
                <p className="text-xs text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>

            {/* Message */}
            {activity.message && (
              <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <MessageCircle className="h-4 w-4" />
                  <span>{t('detail.message')}</span>
                </div>
                <p className="text-slate-900 text-sm leading-relaxed">
                  {activity.message}
                </p>
              </div>
            )}

            {/* Details */}
            {activity.details && (
              <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <FileText className="h-4 w-4" />
                  <span>{t('detail.details')}</span>
                </div>
                <p className="text-slate-900 text-sm leading-relaxed whitespace-pre-wrap">
                  {activity.details}
                </p>
              </div>
            )}

            {/* Agent ID */}
            {activity.agent_id && (
              <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Tag className="h-4 w-4" />
                  <span>{t('detail.relatedAgent')}</span>
                </div>
                <p className="text-slate-900 font-mono text-sm">
                  {activity.agent_id}
                </p>
              </div>
            )}

            {/* Metadata */}
            {parsedMetadata && Object.keys(parsedMetadata).length > 0 && (
              <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <Database className="h-4 w-4" />
                  <span>{t('detail.metadata')}</span>
                </div>
                <pre className="text-xs text-agora-muted bg-agora-darker rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(parsedMetadata, null, 2)}
                </pre>
              </div>
            )}

            {/* Time Info */}
            <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                <Clock className="h-4 w-4" />
                <span>{t('detail.timeInfo')}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-agora-muted">{t('detail.created')}</p>
                  <p className="text-slate-900">{format(new Date(activity.created_at), 'PPpp')}</p>
                </div>
                {activity.timestamp && activity.timestamp !== activity.created_at && (
                  <div>
                    <p className="text-agora-muted">{t('detail.occurred')}</p>
                    <p className="text-slate-900">{format(new Date(activity.timestamp), 'PPpp')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-agora-border p-4">
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <span>{activity.type}</span>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
            >
              {t('detail.close')}
            </button>
          </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
