'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, MinusCircle, Wallet, Loader2 } from 'lucide-react';

interface TokenVotingProps {
  proposalId: string;
  onVoteSuccess?: () => void;
}

interface VoteRecord {
  walletAddress: string;
  choice: 'for' | 'against' | 'abstain';
  votingPower: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export function TokenVoting({ proposalId, onVoteSuccess }: TokenVotingProps) {
  const t = useTranslations('Proposals');
  const tWallet = useTranslations('Wallet');
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [selectedChoice, setSelectedChoice] = useState<'for' | 'against' | 'abstain' | null>(null);
  const [reason, setReason] = useState('');

  // Check if user already voted
  const { data: existingVote, isLoading: checkingVote } = useQuery({
    queryKey: ['token-vote', proposalId, address],
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch(`${API_URL}/api/token/voting/${proposalId}/votes`);
      const votes = await res.json();
      return votes.find((v: VoteRecord) => v.walletAddress.toLowerCase() === address.toLowerCase());
    },
    enabled: isConnected && !!address,
  });

  // Check voting eligibility
  const { data: holder } = useQuery({
    queryKey: ['token-holder', address],
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch(`${API_URL}/api/token/holders/wallet/${address}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isConnected && !!address,
  });

  // Get voting info
  const { data: votingInfo } = useQuery({
    queryKey: ['token-voting-info', proposalId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/token/voting/${proposalId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async (choice: 'for' | 'against' | 'abstain') => {
      const res = await fetch(`${API_URL}/api/token/voting/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          choice,
          reason: reason || undefined,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to cast vote');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-vote', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['token-voting-info', proposalId] });
      onVoteSuccess?.();
    },
  });

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="flex items-center gap-3 text-agora-muted">
          <Wallet className="h-5 w-5" />
          <span className="text-sm">{tWallet('connectWallet')} to vote with your MOC tokens</span>
        </div>
      </div>
    );
  }

  if (checkingVote) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="flex items-center justify-center gap-2 text-agora-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (existingVote) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center">
          <p className="text-sm text-agora-muted mb-2">You have already voted</p>
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            existingVote.choice === 'for' ? 'bg-green-500/20 text-green-400' :
            existingVote.choice === 'against' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {existingVote.choice === 'for' && <ThumbsUp className="h-4 w-4" />}
            {existingVote.choice === 'against' && <ThumbsDown className="h-4 w-4" />}
            {existingVote.choice === 'abstain' && <MinusCircle className="h-4 w-4" />}
            {t(existingVote.choice)} ({existingVote.votingPower.toLocaleString()} voting power)
          </div>
        </div>
      </div>
    );
  }

  if (!holder?.isVerified) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm mb-2">Your wallet is not verified</p>
          <p className="text-xs">Please verify your wallet to participate in token voting</p>
        </div>
      </div>
    );
  }

  if (!votingInfo) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm">Token voting not initialized for this proposal</p>
        </div>
      </div>
    );
  }

  const isVotingActive = votingInfo.status === 'active' && new Date(votingInfo.votingEndsAt) > new Date();

  if (!isVotingActive) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm">Voting has ended</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
      <h4 className="mb-4 font-medium text-white">Cast Your Vote</h4>

      <div className="mb-4 text-sm text-agora-muted">
        Your voting power: <span className="text-white font-medium">{holder.votingPower.toLocaleString()}</span>
      </div>

      {/* Vote Options */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          onClick={() => setSelectedChoice('for')}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedChoice === 'for'
              ? 'border-green-500 bg-green-500/10 text-green-400'
              : 'border-agora-border hover:border-green-500/50 text-agora-muted hover:text-green-400'
          }`}
        >
          <ThumbsUp className="h-6 w-6" />
          <span className="text-sm font-medium">{t('for')}</span>
        </button>

        <button
          onClick={() => setSelectedChoice('against')}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedChoice === 'against'
              ? 'border-red-500 bg-red-500/10 text-red-400'
              : 'border-agora-border hover:border-red-500/50 text-agora-muted hover:text-red-400'
          }`}
        >
          <ThumbsDown className="h-6 w-6" />
          <span className="text-sm font-medium">{t('against')}</span>
        </button>

        <button
          onClick={() => setSelectedChoice('abstain')}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedChoice === 'abstain'
              ? 'border-gray-500 bg-gray-500/10 text-gray-400'
              : 'border-agora-border hover:border-gray-500/50 text-agora-muted hover:text-gray-400'
          }`}
        >
          <MinusCircle className="h-6 w-6" />
          <span className="text-sm font-medium">{t('abstain')}</span>
        </button>
      </div>

      {/* Reason (optional) */}
      <div className="mb-4">
        <label className="block text-sm text-agora-muted mb-2">Reason (optional)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you voting this way?"
          className="w-full rounded-lg border border-agora-border bg-agora-darker px-3 py-2 text-sm text-white placeholder-agora-muted focus:border-agora-primary focus:outline-none resize-none"
          rows={2}
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={() => selectedChoice && voteMutation.mutate(selectedChoice)}
        disabled={!selectedChoice || voteMutation.isPending}
        className="w-full rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {voteMutation.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Casting vote...
          </span>
        ) : (
          'Cast Vote'
        )}
      </button>

      {voteMutation.isError && (
        <p className="mt-2 text-xs text-red-400">{voteMutation.error.message}</p>
      )}
    </div>
  );
}
