'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Vote,
  TrendingUp,
  ArrowRight,
  User,
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

interface ProposalCardProps {
  proposal: Proposal;
  onClick?: () => void;
}

const statusConfig = {
  draft: {
    icon: FileText,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  },
  active: {
    icon: Vote,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
    border: 'border-agora-primary/30',
  },
  passed: {
    icon: CheckCircle,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
  },
  rejected: {
    icon: XCircle,
    color: 'text-agora-error',
    bg: 'bg-agora-error/10',
    border: 'border-agora-error/30',
  },
  executed: {
    icon: TrendingUp,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
  },
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function ProposalCard({ proposal, onClick }: ProposalCardProps) {
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
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-lg border bg-agora-card p-5 transition-all hover:shadow-lg hover:bg-agora-card/80 ${statusConfig[proposal.status].border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`rounded-lg p-2 ${statusConfig[proposal.status].bg}`}>
            <StatusIcon className={`h-5 w-5 ${statusConfig[proposal.status].color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-agora-muted">{proposal.id}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}
              >
                {t(`status.${proposal.status}`)}
              </span>
            </div>
            <h3 className="mt-1 font-semibold text-slate-900 group-hover:text-agora-primary transition-colors">
              {proposal.title}
            </h3>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="mt-3 text-sm text-agora-muted line-clamp-2">{proposal.summary}</p>

      {/* Voting Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-4">
            <span className="text-agora-success">
              {t('for')}: {formatNumber(proposal.votesFor)} ({forPercent.toFixed(1)}%)
            </span>
            <span className="text-agora-error">
              {t('against')}: {formatNumber(proposal.votesAgainst)} ({againstPercent.toFixed(1)}%)
            </span>
            <span className="text-agora-muted">
              {t('abstain')}: {formatNumber(proposal.votesAbstain)}
            </span>
          </div>
          <span className={quorumReached ? 'text-agora-success' : 'text-agora-warning'}>
            {t('quorum')}: {quorumPercent.toFixed(0)}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 rounded-full bg-agora-darker overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-agora-success transition-all"
              style={{ width: `${forPercent}%` }}
            />
            <div
              className="bg-agora-error transition-all"
              style={{ width: `${againstPercent}%` }}
            />
            <div
              className="bg-gray-500 transition-all"
              style={{ width: `${abstainPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-agora-muted">
            <User className="h-3 w-3" />
            {proposal.author}
          </span>
          <span className="flex items-center gap-1 text-agora-muted">
            <Clock className="h-3 w-3" />
            {isActive && !hasEnded
              ? `${t('endsIn')} ${formatDistanceToNow(endDate)}`
              : `${t('ended')} ${formatDistanceToNow(endDate, { addSuffix: true })}`}
          </span>
        </div>

        <span className="flex items-center gap-1 text-agora-primary opacity-0 transition-opacity group-hover:opacity-100">
          {t('viewDetails')}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
