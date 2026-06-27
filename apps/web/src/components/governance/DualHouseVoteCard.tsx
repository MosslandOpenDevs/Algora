'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  Vote,
  Coins,
  Code2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { type DualHouseVote } from '@/lib/api';
import { safeFormatDate } from '@/lib/utils';
import { MockDataBadge } from '@/components/ui/MockDataBadge';

interface DualHouseVoteCardProps {
  vote: DualHouseVote;
  onClick?: () => void;
  index?: number;
}

const statusColors: Record<string, string> = {
  pending: 'text-agora-muted bg-agora-muted/10',
  voting: 'text-agora-primary bg-agora-primary/10',
  passed: 'text-agora-success bg-agora-success/10',
  rejected: 'text-agora-error bg-agora-error/10',
  reconciliation: 'text-agora-warning bg-agora-warning/10',
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  voting: Vote,
  passed: CheckCircle,
  rejected: XCircle,
  reconciliation: AlertTriangle,
};

function HouseResult({
  name,
  icon: Icon,
  votesFor,
  votesAgainst,
  votesAbstain,
  quorumReached,
  passed,
}: {
  name: string;
  icon: React.ElementType;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumReached: boolean;
  passed?: boolean;
}) {
  const total = votesFor + votesAgainst + votesAbstain;
  const forPercent = total > 0 ? (votesFor / total) * 100 : 0;
  const againstPercent = total > 0 ? (votesAgainst / total) * 100 : 0;

  return (
    <div className="flex-1 rounded-lg bg-agora-dark/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-agora-muted" />
        <span className="text-xs font-medium text-agora-text">{name}</span>
        {passed !== undefined && (
          <span
            className={`ml-auto text-xs font-medium ${passed ? 'text-agora-success' : 'text-agora-error'}`}
          >
            {passed ? 'PASSED' : 'FAILED'}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-agora-border overflow-hidden flex">
        <div
          className="bg-agora-success transition-all"
          style={{ width: `${forPercent}%` }}
        />
        <div
          className="bg-agora-error transition-all"
          style={{ width: `${againstPercent}%` }}
        />
      </div>

      {/* Vote counts */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-agora-success">{votesFor.toLocaleString()} For</span>
        <span className="text-agora-error">{votesAgainst.toLocaleString()} Against</span>
      </div>

      {/* Quorum */}
      <div className="mt-1 flex items-center gap-1 text-xs">
        {quorumReached ? (
          <>
            <CheckCircle className="h-3 w-3 text-agora-success" />
            <span className="text-agora-success">Quorum Reached</span>
          </>
        ) : (
          <>
            <Clock className="h-3 w-3 text-agora-warning" />
            <span className="text-agora-warning">Quorum Pending</span>
          </>
        )}
      </div>
    </div>
  );
}

export function DualHouseVoteCard({ vote, onClick, index = 0 }: DualHouseVoteCardProps) {
  const t = useTranslations('Governance.voting');
  const StatusIcon = statusIcons[vote.status] || Clock;
  const statusColor = statusColors[vote.status] || 'text-agora-muted bg-agora-muted/10';

  return (
    <div
      className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-agora-text line-clamp-1">{vote.title}</h3>
          <p className="text-xs text-agora-muted mt-1">
            {vote.status === 'voting'
              ? `Ends ${safeFormatDate(vote.expiresAt, (d) => formatDistanceToNow(d, { addSuffix: true }))}`
              : `Created ${safeFormatDate(vote.createdAt, (d) => formatDistanceToNow(d, { addSuffix: true }))}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <MockDataBadge />
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${statusColor}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium capitalize">{t(`status.${vote.status}`)}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-agora-muted" />
        </div>
      </div>

      {/* Dual House Results */}
      <div className="flex gap-3">
        <HouseResult
          name={t('mossCoinHouse')}
          icon={Coins}
          votesFor={vote.mossCoinHouse.votesFor}
          votesAgainst={vote.mossCoinHouse.votesAgainst}
          votesAbstain={vote.mossCoinHouse.votesAbstain}
          quorumReached={vote.mossCoinHouse.quorumReached}
          passed={vote.mossCoinHouse.passed}
        />
        <HouseResult
          name={t('openSourceHouse')}
          icon={Code2}
          votesFor={vote.openSourceHouse.votesFor}
          votesAgainst={vote.openSourceHouse.votesAgainst}
          votesAbstain={vote.openSourceHouse.votesAbstain}
          quorumReached={vote.openSourceHouse.quorumReached}
          passed={vote.openSourceHouse.passed}
        />
      </div>
    </div>
  );
}
