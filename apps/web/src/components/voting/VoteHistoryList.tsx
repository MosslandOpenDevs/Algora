'use client';

import { useTranslations } from 'next-intl';
import { Vote } from 'lucide-react';
import { Skeleton, ListSkeleton } from '@/components/ui/Skeleton';
import { VoteHistoryCard, type VoteHistoryItem } from './VoteHistoryCard';

interface VoteHistoryListProps {
  votes: VoteHistoryItem[];
  isLoading?: boolean;
}

export function VoteHistoryList({ votes, isLoading }: VoteHistoryListProps) {
  const t = useTranslations('Voting');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-agora-border bg-agora-card p-3"
            >
              <Skeleton className="mx-auto h-7 w-10" />
              <Skeleton className="mx-auto mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
        <ListSkeleton count={3} />
      </div>
    );
  }

  if (votes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-agora-border bg-agora-card/50 p-8 text-center">
        <Vote className="mx-auto h-10 w-10 text-agora-muted" />
        <p className="mt-3 text-sm text-agora-muted">{t('noVoteHistory')}</p>
        <p className="mt-1 text-xs text-agora-muted">{t('noVoteHistoryDesc')}</p>
      </div>
    );
  }

  // Group votes by status (recent first)
  const sortedVotes = [...votes].sort(
    (a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime()
  );

  // Calculate stats
  const stats = {
    total: votes.length,
    for: votes.filter((v) => v.choice === 'for').length,
    against: votes.filter((v) => v.choice === 'against').length,
    abstain: votes.filter((v) => v.choice === 'abstain').length,
    totalPower: votes.reduce((sum, v) => sum + v.votingPower, 0),
  };

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-3 text-center">
          <p className="text-2xl font-bold text-agora-text">{stats.total}</p>
          <p className="text-xs text-agora-muted">{t('totalVotes')}</p>
        </div>
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-center">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.for}</p>
          <p className="text-xs text-green-700/80 dark:text-green-400/80">{t('votedFor')}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center">
          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.against}</p>
          <p className="text-xs text-red-700/80 dark:text-red-400/80">{t('votedAgainst')}</p>
        </div>
        <div className="rounded-lg border border-gray-500/30 bg-gray-500/10 p-3 text-center">
          <p className="text-2xl font-bold text-gray-400">{stats.abstain}</p>
          <p className="text-xs text-gray-400/80">{t('votedAbstain')}</p>
        </div>
      </div>

      {/* Vote List */}
      <div className="space-y-3">
        {sortedVotes.map((vote, index) => (
          <VoteHistoryCard key={vote.id} vote={vote} index={index} />
        ))}
      </div>
    </div>
  );
}
