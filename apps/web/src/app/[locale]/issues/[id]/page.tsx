'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft,
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
  ExternalLink,
  Share2,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

import { fetchIssue } from '@/lib/api';
import { safeFormatDate } from '@/lib/utils';

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

function getEvidence(evidence: string | null): Array<{ source: string; severity: string; description: string; timestamp: string }> {
  if (!evidence) return [];
  try {
    return JSON.parse(evidence);
  } catch {
    return [];
  }
}

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Issues');
  const issueId = params.id as string;

  const { data: issue, isLoading, error } = useQuery({
    queryKey: ['issue', issueId],
    queryFn: () => fetchIssue(issueId),
    enabled: !!issueId,
  });

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: issue?.title, url });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-agora-primary" />
          <p className="text-agora-muted">Loading issue...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !issue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="mb-4 rounded-full bg-agora-card p-4">
          <AlertCircle className="h-12 w-12 text-agora-error" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Issue Not Found</h1>
        <p className="text-agora-muted mb-6 max-w-md">
          The issue you&apos;re looking for doesn&apos;t exist or may have been removed.
        </p>
        <Link
          href="/issues"
          className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Issues
        </Link>
      </div>
    );
  }

  const StatusIcon = statusConfig[issue.status]?.icon || AlertCircle;
  const evidenceList = getEvidence(issue.evidence);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-agora-muted hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-2 text-agora-muted hover:text-slate-900 transition-colors"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
      </div>

      {/* Header Card */}
      <div className="rounded-xl border border-agora-border bg-agora-card p-6 animate-slide-up">
        <div className="flex items-start gap-4">
          <div
            className={`rounded-lg border p-3 ${statusConfig[issue.status]?.bg || 'bg-gray-500/10'} ${statusConfig[issue.status]?.border || 'border-gray-500/30'}`}
          >
            <StatusIcon className={`h-6 w-6 ${statusConfig[issue.status]?.color || 'text-gray-500'}`} />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 break-words">{issue.title}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* Status Badge */}
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusConfig[issue.status]?.bg || 'bg-gray-500/10'} ${statusConfig[issue.status]?.color || 'text-gray-500'}`}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {t(`status.${issue.status}`)}
              </span>

              {/* Priority Badge */}
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${priorityConfig[issue.priority]?.bg || 'bg-gray-500/10'} ${priorityConfig[issue.priority]?.color || 'text-gray-500'}`}
              >
                {t(`priority.${issue.priority}`)}
              </span>

              {/* Category */}
              <span className="flex items-center gap-1.5 text-sm text-agora-muted">
                <Tag className="h-3.5 w-3.5" />
                {issue.category || 'General'}
              </span>

              {/* Issue ID */}
              <span className="text-xs text-agora-muted font-mono bg-agora-border/50 px-2 py-0.5 rounded">
                #{issue.id.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div
        className="rounded-xl border border-agora-border bg-agora-card p-6 animate-slide-up"
        style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
      >
        <div className="flex items-center gap-2 mb-4 text-sm text-agora-muted">
          <FileText className="h-4 w-4" />
          <span>{t('detail.description')}</span>
        </div>
        <div className="prose prose-slate max-w-none">
          <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
            {issue.description}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up"
        style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
      >
        {/* Signals */}
        <div className="rounded-xl border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
          <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
            <Radio className="h-4 w-4" />
            <span>{t('detail.relatedSignals')}</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{getSignalCount(issue.signal_ids)}</p>
          <p className="text-xs text-agora-muted mt-1">{t('signals')}</p>
        </div>

        {/* Created */}
        <div className="rounded-xl border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
          <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
            <Calendar className="h-4 w-4" />
            <span>{t('detail.created')}</span>
          </div>
          <p className="text-lg font-bold text-slate-900">
            {safeFormatDate(issue.created_at, (d) => format(d, 'MMM d, yyyy'))}
          </p>
          <p className="text-xs text-agora-muted mt-1">
            {safeFormatDate(issue.created_at, (d) => formatDistanceToNow(d, { addSuffix: true }))}
          </p>
        </div>

        {/* Updated */}
        <div className="rounded-xl border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
          <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
            <Clock className="h-4 w-4" />
            <span>{t('detail.lastUpdated')}</span>
          </div>
          <p className="text-lg font-bold text-slate-900">
            {safeFormatDate(issue.updated_at, (d) => format(d, 'MMM d, yyyy'))}
          </p>
          <p className="text-xs text-agora-muted mt-1">
            {safeFormatDate(issue.updated_at, (d) => formatDistanceToNow(d, { addSuffix: true }))}
          </p>
        </div>

        {/* Category */}
        <div className="rounded-xl border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
          <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
            <Tag className="h-4 w-4" />
            <span>Category</span>
          </div>
          <p className="text-lg font-bold text-slate-900 capitalize">{issue.category || 'General'}</p>
          <p className="text-xs text-agora-muted mt-1">{t(`priority.${issue.priority}`)} priority</p>
        </div>
      </div>

      {/* Progress Indicator */}
      {(issue.status === 'detected' || issue.status === 'confirmed' || issue.status === 'in_progress') && (
        <div
          className="rounded-xl border border-agora-border bg-agora-card p-6 animate-slide-up"
          style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 mb-4 text-sm text-agora-muted">
            <TrendingUp className="h-4 w-4" />
            <span>{t('detail.progress')}</span>
          </div>
          <div className="flex items-center gap-2">
            {['detected', 'confirmed', 'in_progress', 'resolved'].map((step, index) => {
              const stepIndex = ['detected', 'confirmed', 'in_progress', 'resolved'].indexOf(issue.status);
              const isCompleted = index <= stepIndex;
              const isCurrent = step === issue.status;
              const StepIcon = statusConfig[step as keyof typeof statusConfig]?.icon || AlertCircle;

              return (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={`
                      flex items-center justify-center h-10 w-10 rounded-full
                      transition-all duration-300
                      ${isCompleted
                        ? isCurrent
                          ? `${statusConfig[step as keyof typeof statusConfig]?.bg} ${statusConfig[step as keyof typeof statusConfig]?.color} ring-2 ring-offset-2 ring-offset-agora-card ${statusConfig[step as keyof typeof statusConfig]?.border?.replace('border', 'ring')}`
                          : 'bg-agora-success/20 text-agora-success'
                        : 'bg-agora-border text-agora-muted'
                      }
                    `}
                  >
                    {isCompleted && !isCurrent ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
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
          <div className="flex justify-between mt-3 text-xs text-agora-muted">
            <span>{t('status.detected')}</span>
            <span>{t('status.confirmed')}</span>
            <span>{t('status.in_progress')}</span>
            <span>{t('status.resolved')}</span>
          </div>
        </div>
      )}

      {/* Evidence Section */}
      {evidenceList.length > 0 && (
        <div
          className="rounded-xl border border-agora-border bg-agora-card p-6 animate-slide-up"
          style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 mb-4 text-sm text-agora-muted">
            <Eye className="h-4 w-4" />
            <span>Evidence ({evidenceList.length})</span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {evidenceList.slice(0, 10).map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-agora-dark border border-agora-border"
              >
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    item.severity === 'critical'
                      ? 'bg-agora-error/10 text-agora-error'
                      : item.severity === 'high'
                      ? 'bg-orange-500/10 text-orange-500'
                      : item.severity === 'medium'
                      ? 'bg-agora-warning/10 text-agora-warning'
                      : 'bg-gray-500/10 text-gray-400'
                  }`}
                >
                  {item.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 break-words">{item.description}</p>
                  <p className="text-xs text-agora-muted mt-1">{item.source}</p>
                </div>
              </div>
            ))}
            {evidenceList.length > 10 && (
              <p className="text-sm text-agora-muted text-center py-2">
                + {evidenceList.length - 10} more evidence items
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-xl border border-agora-border bg-agora-card p-6 animate-slide-up"
        style={{ animationDelay: '250ms', animationFillMode: 'backwards' }}
      >
        <div className="flex items-center gap-2 text-sm text-agora-muted">
          <Tag className="h-4 w-4" />
          <span className="font-mono">Issue #{issue.id}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {issue.status === 'detected' && (
            <button className="flex items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-accent/80 hover:scale-105">
              <Eye className="h-4 w-4" />
              <span>Confirm Issue</span>
            </button>
          )}

          {issue.status === 'confirmed' && (
            <Link
              href={`/agora?issue=${issue.id}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
            >
              <Users className="h-4 w-4" />
              <span>{t('detail.startDiscussion')}</span>
            </Link>
          )}

          {issue.status === 'in_progress' && (
            <Link
              href={`/proposals?issue=${issue.id}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
            >
              <Vote className="h-4 w-4" />
              <span>{t('detail.createProposal')}</span>
            </Link>
          )}

          <Link
            href="/issues"
            className="flex items-center justify-center gap-2 rounded-lg border border-agora-border px-4 py-2 text-sm font-medium text-agora-muted transition-all hover:bg-agora-border hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            <span>All Issues</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
