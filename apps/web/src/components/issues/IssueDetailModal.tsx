'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  AlertCircle,
  Radio,
  CheckCircle,
  Clock,
  Vote,
  XCircle,
  Calendar,
  Tag,
  FileText,
  Users,
  TrendingUp,
  Eye,
  PlayCircle,
} from 'lucide-react';

import type { Issue } from '@/lib/api';

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
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
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', border: 'border-agora-warning/30' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { color: 'text-agora-error', bg: 'bg-agora-error/10', border: 'border-agora-error/30' },
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

export function IssueDetailModal({ issue, onClose }: IssueDetailModalProps) {
  const t = useTranslations('Issues');
  const StatusIcon = statusConfig[issue.status].icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="animate-fade-in fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center sm:inset-10">
        <div className="animate-scale-in w-full max-w-2xl max-h-full overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl">
          {/* Header */}
          <div
            className="animate-slide-up flex items-start justify-between border-b border-agora-border p-6"
            style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-start gap-4">
              <div
                className={`
                  rounded-lg border p-3 transition-transform duration-300 hover:scale-110
                  ${statusConfig[issue.status].bg} ${statusConfig[issue.status].border}
                `}
              >
                <StatusIcon className={`h-5 w-5 ${statusConfig[issue.status].color}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 pr-8">{issue.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {/* Status Badge */}
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[issue.status].bg} ${statusConfig[issue.status].color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {t(`status.${issue.status}`)}
                  </span>

                  {/* Priority Badge */}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityConfig[issue.priority].bg} ${priorityConfig[issue.priority].color}`}
                  >
                    {t(`priority.${issue.priority}`)}
                  </span>

                  {/* Issue ID */}
                  <span className="text-xs text-agora-muted font-mono">
                    #{issue.id}
                  </span>
                </div>
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
            {/* Description */}
            <div
              className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4"
              style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
            >
              <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                <FileText className="h-4 w-4" />
                <span>{t('detail.description')}</span>
              </div>
              <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                {issue.description}
              </p>
            </div>

            {/* Stats Grid */}
            <div
              className="animate-slide-up mt-4 grid grid-cols-2 gap-4"
              style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
            >
              {/* Signals */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Radio className="h-4 w-4" />
                  <span>{t('detail.relatedSignals')}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{getSignalCount(issue.signal_ids)}</p>
                <p className="text-xs text-agora-muted mt-1">{t('signals')}</p>
              </div>

              {/* Category */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Tag className="h-4 w-4" />
                  <span>Category</span>
                </div>
                <p className="text-lg font-bold text-slate-900 capitalize">{issue.category || 'General'}</p>
              </div>
            </div>

            {/* Timeline */}
            <div
              className="animate-slide-up mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
              style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
            >
              {/* Created */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Calendar className="h-4 w-4" />
                  <span>{t('detail.created')}</span>
                </div>
                <p className="text-slate-900 font-medium">
                  {format(new Date(issue.created_at), 'PPpp')}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Updated */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Clock className="h-4 w-4" />
                  <span>{t('detail.lastUpdated')}</span>
                </div>
                <p className="text-slate-900 font-medium">
                  {format(new Date(issue.updated_at), 'PPpp')}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(issue.updated_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {/* Progress Indicator - only for non-resolved/dismissed */}
            {(issue.status === 'detected' || issue.status === 'confirmed' || issue.status === 'in_progress') && (
              <div
                className="animate-slide-up mt-4 rounded-lg border border-agora-border bg-agora-card p-4"
                style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
              >
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <TrendingUp className="h-4 w-4" />
                  <span>{t('detail.progress')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {['detected', 'confirmed', 'in_progress', 'resolved'].map((step, index) => {
                    const stepIndex = ['detected', 'confirmed', 'in_progress', 'resolved'].indexOf(issue.status);
                    const isCompleted = index <= stepIndex;
                    const isCurrent = step === issue.status;

                    return (
                      <div key={step} className="flex items-center flex-1">
                        <div className={`
                          flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium
                          transition-all duration-300
                          ${isCompleted
                            ? isCurrent
                              ? `${statusConfig[issue.status].bg} ${statusConfig[issue.status].color} animate-pulse`
                              : 'bg-agora-success/20 text-agora-success'
                            : 'bg-agora-card text-agora-muted'
                          }
                        `}>
                          {isCompleted && !isCurrent ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        {index < 3 && (
                          <div className="flex-1 h-1 mx-2 rounded bg-agora-border overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                index < stepIndex ? 'bg-agora-success' : 'bg-transparent'
                              }`}
                              style={{ width: index < stepIndex ? '100%' : '0%' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-agora-muted">
                  <span>{t('status.detected')}</span>
                  <span>{t('status.confirmed')}</span>
                  <span>{t('status.in_progress')}</span>
                  <span>{t('status.resolved')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="animate-slide-up flex items-center justify-between border-t border-agora-border p-4"
            style={{ animationDelay: '250ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <Tag className="h-4 w-4" />
              <span>Issue #{issue.id}</span>
            </div>

            <div className="flex items-center gap-3">
              {issue.status === 'detected' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-accent/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-accent/30">
                  <Eye className="h-4 w-4" />
                  Confirm Issue
                </button>
              )}

              {issue.status === 'confirmed' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-primary/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-primary/30">
                  <Users className="h-4 w-4" />
                  {t('detail.startDiscussion')}
                </button>
              )}

              {issue.status === 'in_progress' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-primary/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-primary/30">
                  <Vote className="h-4 w-4" />
                  {t('detail.createProposal')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
