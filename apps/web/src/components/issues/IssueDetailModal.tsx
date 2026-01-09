'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  AlertCircle,
  MessageSquare,
  Radio,
  CheckCircle,
  Clock,
  Vote,
  XCircle,
  Calendar,
  Tag,
  FileText,
  ArrowRight,
  Users,
  TrendingUp,
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

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
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
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', border: 'border-agora-warning/30' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { color: 'text-agora-error', bg: 'bg-agora-error/10', border: 'border-agora-error/30' },
};

export function IssueDetailModal({ issue, onClose }: IssueDetailModalProps) {
  const t = useTranslations('Issues');
  const StatusIcon = statusConfig[issue.status].icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center sm:inset-10">
        <div className="w-full max-w-2xl max-h-full overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-agora-border p-6">
            <div className="flex items-start gap-4">
              <div className={`rounded-lg border p-3 ${statusConfig[issue.status].bg} ${statusConfig[issue.status].border}`}>
                <StatusIcon className={`h-5 w-5 ${statusConfig[issue.status].color}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white pr-8">{issue.title}</h2>
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
              className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Description */}
            <div className="rounded-lg border border-agora-border bg-agora-card p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                <FileText className="h-4 w-4" />
                <span>{t('detail.description')}</span>
              </div>
              <p className="text-white whitespace-pre-wrap leading-relaxed">
                {issue.description}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              {/* Signals */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Radio className="h-4 w-4" />
                  <span>{t('detail.relatedSignals')}</span>
                </div>
                <p className="text-2xl font-bold text-white">{issue.signalCount}</p>
                <p className="text-xs text-agora-muted mt-1">{t('signals')}</p>
              </div>

              {/* Comments */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <MessageSquare className="h-4 w-4" />
                  <span>{t('detail.comments')}</span>
                </div>
                <p className="text-2xl font-bold text-white">{issue.commentCount}</p>
                <p className="text-xs text-agora-muted mt-1">{t('comments')}</p>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Created */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Calendar className="h-4 w-4" />
                  <span>{t('detail.created')}</span>
                </div>
                <p className="text-white font-medium">
                  {format(new Date(issue.created_at), 'PPpp')}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Updated */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Clock className="h-4 w-4" />
                  <span>{t('detail.lastUpdated')}</span>
                </div>
                <p className="text-white font-medium">
                  {format(new Date(issue.updated_at), 'PPpp')}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(issue.updated_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {/* Progress Indicator - only for non-resolved/rejected */}
            {(issue.status === 'open' || issue.status === 'discussing' || issue.status === 'voting') && (
              <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <TrendingUp className="h-4 w-4" />
                  <span>{t('detail.progress')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {['open', 'discussing', 'voting', 'resolved'].map((step, index) => {
                    const stepIndex = ['open', 'discussing', 'voting', 'resolved'].indexOf(issue.status);
                    const isCompleted = index <= stepIndex;
                    const isCurrent = step === issue.status;

                    return (
                      <div key={step} className="flex items-center flex-1">
                        <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium ${
                          isCompleted
                            ? isCurrent
                              ? `${statusConfig[issue.status].bg} ${statusConfig[issue.status].color}`
                              : 'bg-agora-success/20 text-agora-success'
                            : 'bg-agora-card text-agora-muted'
                        }`}>
                          {index + 1}
                        </div>
                        {index < 3 && (
                          <div className={`flex-1 h-1 mx-2 rounded ${
                            index < stepIndex ? 'bg-agora-success' : 'bg-agora-border'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-agora-muted">
                  <span>{t('status.open')}</span>
                  <span>{t('status.discussing')}</span>
                  <span>{t('status.voting')}</span>
                  <span>{t('status.resolved')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-agora-border p-4">
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <Tag className="h-4 w-4" />
              <span>Issue #{issue.id}</span>
            </div>

            <div className="flex items-center gap-3">
              {issue.status === 'open' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-accent/80">
                  <Users className="h-4 w-4" />
                  {t('detail.startDiscussion')}
                </button>
              )}

              {issue.status === 'discussing' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-primary/80">
                  <Vote className="h-4 w-4" />
                  {t('detail.createProposal')}
                </button>
              )}

              {issue.status === 'voting' && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-primary/80">
                  <ArrowRight className="h-4 w-4" />
                  {t('detail.viewProposal')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
