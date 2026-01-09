'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Vote,
  TrendingUp,
  User,
  Calendar,
  Target,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  ExternalLink,
  Share2,
} from 'lucide-react';

interface Proposal {
  id: string;
  title: string;
  summary: string;
  status: 'draft' | 'active' | 'passed' | 'rejected' | 'executed';
  issueId?: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum: number;
  endDate: string;
  created_at: string;
  author: string;
}

interface ProposalDetailModalProps {
  proposal: Proposal;
  onClose: () => void;
}

const statusConfig = {
  draft: {
    icon: FileText,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    label: 'Draft',
  },
  active: {
    icon: Vote,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
    border: 'border-agora-primary/30',
    label: 'Active',
  },
  passed: {
    icon: CheckCircle,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
    label: 'Passed',
  },
  rejected: {
    icon: XCircle,
    color: 'text-agora-error',
    bg: 'bg-agora-error/10',
    border: 'border-agora-error/30',
    label: 'Rejected',
  },
  executed: {
    icon: TrendingUp,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
    label: 'Executed',
  },
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function ProposalDetailModal({ proposal, onClose }: ProposalDetailModalProps) {
  const t = useTranslations('Proposals');
  const StatusIcon = statusConfig[proposal.status].icon;

  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const forPercent = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;
  const againstPercent = totalVotes > 0 ? (proposal.votesAgainst / totalVotes) * 100 : 0;
  const abstainPercent = totalVotes > 0 ? (proposal.votesAbstain / totalVotes) * 100 : 0;
  const quorumPercent = Math.min((totalVotes / proposal.quorum) * 100, 100);
  const quorumReached = totalVotes >= proposal.quorum;

  const isActive = proposal.status === 'active';
  const endDate = new Date(proposal.endDate);
  const hasEnded = endDate < new Date();

  return (
    <>
      {/* Backdrop */}
      <div
        className="animate-fade-in fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center sm:inset-10">
        <div className="animate-scale-in w-full max-w-3xl max-h-full overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-agora-border p-6">
            <div className="flex items-start gap-4">
              <div className={`rounded-lg border p-3 ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].border}`}>
                <StatusIcon className={`h-5 w-5 ${statusConfig[proposal.status].color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono text-agora-muted">{proposal.id}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}
                  >
                    {t(`status.${proposal.status}`)}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 pr-8">{proposal.title}</h2>
                <div className="mt-2 flex items-center gap-3 text-sm text-agora-muted">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {proposal.author}
                  </span>
                  {proposal.issueId && (
                    <span className="flex items-center gap-1">
                      <ExternalLink className="h-4 w-4" />
                      Issue #{proposal.issueId}
                    </span>
                  )}
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
            {/* Summary */}
            <div className="rounded-lg border border-agora-border bg-agora-card p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                <FileText className="h-4 w-4" />
                <span>{t('detail.summary')}</span>
              </div>
              <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                {proposal.summary}
              </p>
            </div>

            {/* Voting Results */}
            <div className="mt-4 rounded-lg border border-agora-border bg-agora-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-agora-muted">
                  <Vote className="h-4 w-4" />
                  <span>{t('detail.votingResults')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${quorumReached ? 'text-agora-success' : 'text-agora-warning'}`}>
                    {t('quorum')}: {quorumPercent.toFixed(0)}%
                  </span>
                  {quorumReached && <CheckCircle className="h-4 w-4 text-agora-success" />}
                </div>
              </div>

              {/* Vote Counts */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg bg-agora-success/10 p-4 text-center">
                  <ThumbsUp className="h-6 w-6 text-agora-success mx-auto mb-2" />
                  <p className="text-2xl font-bold text-agora-success">{formatNumber(proposal.votesFor)}</p>
                  <p className="text-sm text-agora-muted">{t('for')} ({forPercent.toFixed(1)}%)</p>
                </div>
                <div className="rounded-lg bg-agora-error/10 p-4 text-center">
                  <ThumbsDown className="h-6 w-6 text-agora-error mx-auto mb-2" />
                  <p className="text-2xl font-bold text-agora-error">{formatNumber(proposal.votesAgainst)}</p>
                  <p className="text-sm text-agora-muted">{t('against')} ({againstPercent.toFixed(1)}%)</p>
                </div>
                <div className="rounded-lg bg-gray-500/10 p-4 text-center">
                  <MinusCircle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-gray-400">{formatNumber(proposal.votesAbstain)}</p>
                  <p className="text-sm text-agora-muted">{t('abstain')} ({abstainPercent.toFixed(1)}%)</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-2">
                <div className="h-4 rounded-full bg-agora-darker overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-agora-success transition-all flex items-center justify-center"
                      style={{ width: `${forPercent}%` }}
                    >
                      {forPercent > 10 && <span className="text-xs font-medium text-slate-900">{forPercent.toFixed(0)}%</span>}
                    </div>
                    <div
                      className="bg-agora-error transition-all flex items-center justify-center"
                      style={{ width: `${againstPercent}%` }}
                    >
                      {againstPercent > 10 && <span className="text-xs font-medium text-slate-900">{againstPercent.toFixed(0)}%</span>}
                    </div>
                    <div
                      className="bg-gray-500 transition-all flex items-center justify-center"
                      style={{ width: `${abstainPercent}%` }}
                    >
                      {abstainPercent > 10 && <span className="text-xs font-medium text-slate-900">{abstainPercent.toFixed(0)}%</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Votes & Quorum */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-agora-muted">
                  {t('detail.totalVotes')}: <span className="text-slate-900 font-medium">{formatNumber(totalVotes)}</span>
                </span>
                <span className="text-agora-muted">
                  {t('detail.quorumRequired')}: <span className="text-slate-900 font-medium">{formatNumber(proposal.quorum)}</span>
                </span>
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
                <p className="text-slate-900 font-medium">
                  {format(new Date(proposal.created_at), 'PPpp')}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {formatDistanceToNow(new Date(proposal.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Voting Period */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Clock className="h-4 w-4" />
                  <span>{isActive && !hasEnded ? t('detail.votingEnds') : t('detail.votingEnded')}</span>
                </div>
                <p className="text-slate-900 font-medium">
                  {format(endDate, 'PPpp')}
                </p>
                <p className={`text-sm mt-1 ${isActive && !hasEnded ? 'text-agora-warning' : 'text-agora-muted'}`}>
                  {isActive && !hasEnded
                    ? `${formatDistanceToNow(endDate)} remaining`
                    : formatDistanceToNow(endDate, { addSuffix: true })}
                </p>
              </div>
            </div>

            {/* Outcome Summary (for completed proposals) */}
            {(proposal.status === 'passed' || proposal.status === 'rejected' || proposal.status === 'executed') && (
              <div className={`mt-4 rounded-lg border p-4 ${
                proposal.status === 'rejected'
                  ? 'border-agora-error/30 bg-agora-error/5'
                  : 'border-agora-success/30 bg-agora-success/5'
              }`}>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  <span className="font-medium text-slate-900">{t('detail.outcome')}</span>
                </div>
                <p className={`mt-2 text-sm ${
                  proposal.status === 'rejected' ? 'text-agora-error' : 'text-agora-success'
                }`}>
                  {proposal.status === 'rejected'
                    ? t('detail.proposalRejected')
                    : proposal.status === 'executed'
                      ? t('detail.proposalExecuted')
                      : t('detail.proposalPassed')}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-agora-border p-4">
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <span>{proposal.id}</span>
              {proposal.issueId && (
                <>
                  <span>•</span>
                  <span>Issue #{proposal.issueId}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border">
                <Share2 className="h-4 w-4" />
                {t('detail.share')}
              </button>

              {isActive && !hasEnded && (
                <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80">
                  <Vote className="h-4 w-4" />
                  {t('detail.castVote')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
