'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { ThumbsUp, ThumbsDown, MinusCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface VoteHistoryItem {
  id: string;
  proposalId: string;
  proposalTitle: string;
  choice: 'for' | 'against' | 'abstain';
  votingPower: number;
  reason?: string;
  votedAt: string;
}

interface VoteHistoryCardProps {
  vote: VoteHistoryItem;
  index?: number;
}

export function VoteHistoryCard({ vote, index = 0 }: VoteHistoryCardProps) {
  const t = useTranslations('Voting');
  const tProposals = useTranslations('Proposals');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  const choiceConfig = {
    for: {
      icon: ThumbsUp,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
    },
    against: {
      icon: ThumbsDown,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
    abstain: {
      icon: MinusCircle,
      color: 'text-gray-400',
      bg: 'bg-gray-500/10',
      border: 'border-gray-500/30',
    },
  };

  const config = choiceConfig[vote.choice];
  const Icon = config.icon;

  return (
    <div
      className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30 animate-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Proposal Title */}
          <Link
            href={`/${locale}/proposals`}
            className="group flex items-center gap-2"
          >
            <h4 className="font-medium text-agora-text truncate group-hover:text-agora-primary transition-colors">
              {vote.proposalTitle}
            </h4>
            <ExternalLink className="h-3 w-3 text-agora-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </Link>

          {/* Proposal ID and Time */}
          <div className="flex items-center gap-2 mt-1 text-xs text-agora-muted">
            <span className="font-mono">{vote.proposalId}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(vote.votedAt), { addSuffix: true })}</span>
          </div>

          {/* Reason */}
          {vote.reason && (
            <p className="mt-2 text-sm text-agora-muted line-clamp-2">
              "{vote.reason}"
            </p>
          )}
        </div>

        {/* Vote Badge */}
        <div className={`flex flex-col items-center gap-1 rounded-lg border p-3 ${config.bg} ${config.border}`}>
          <Icon className={`h-5 w-5 ${config.color}`} />
          <span className={`text-xs font-medium ${config.color}`}>
            {tProposals(vote.choice)}
          </span>
        </div>
      </div>

      {/* Voting Power */}
      <div className="mt-3 pt-3 border-t border-agora-border flex items-center justify-between text-sm">
        <span className="text-agora-muted">{t('votingPower')}</span>
        <span className="font-medium text-agora-text">{vote.votingPower.toLocaleString()}</span>
      </div>
    </div>
  );
}
