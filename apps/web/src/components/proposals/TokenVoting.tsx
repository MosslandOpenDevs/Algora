'use client';

import { useState, useCallback } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ThumbsUp, ThumbsDown, MinusCircle, Wallet, Loader2, Users, Info, Radio } from 'lucide-react';
import { useVoteEvents, type VoteCastEvent, type VoteTallyUpdatedEvent } from '@/hooks/useSocket';
import { MockDataBadge } from '@/components/ui/MockDataBadge';

interface TokenVotingProps {
  proposalId: string;
  onVoteSuccess?: () => void;
}

interface VoteRecord {
  walletAddress: string;
  choice: 'for' | 'against' | 'abstain';
  votingPower: number;
}

interface Delegation {
  id: string;
  delegator: string;
  delegate: string;
  categories?: string[];
  weight: number;
  expires_at?: string;
  is_active: boolean;
}

interface DelegationResponse {
  delegatedTo: Delegation[];
  delegatedFrom: Delegation[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export function TokenVoting({ proposalId, onVoteSuccess }: TokenVotingProps) {
  const t = useTranslations('Proposals');
  const tVoting = useTranslations('Voting');
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
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

  // Get delegation info
  const { data: delegations } = useQuery<DelegationResponse>({
    queryKey: ['delegations', address],
    queryFn: async () => {
      if (!address) return { delegatedTo: [], delegatedFrom: [] };
      const res = await fetch(`${API_URL}/api/proposals/delegation/${address}`);
      if (!res.ok) return { delegatedTo: [], delegatedFrom: [] };
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

  // Real-time vote updates state
  const [recentVote, setRecentVote] = useState<VoteCastEvent | null>(null);
  const [showVoteNotification, setShowVoteNotification] = useState(false);

  // Handle real-time vote events
  const handleVoteCast = useCallback((data: VoteCastEvent) => {
    setRecentVote(data);
    setShowVoteNotification(true);
    // Hide notification after 3 seconds
    setTimeout(() => setShowVoteNotification(false), 3000);
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['token-vote', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['token-voting-info', proposalId] });
  }, [proposalId, queryClient]);

  const handleTallyUpdated = useCallback((_data: VoteTallyUpdatedEvent) => {
    // Invalidate voting info to get fresh tally
    queryClient.invalidateQueries({ queryKey: ['token-voting-info', proposalId] });
  }, [proposalId, queryClient]);

  // Subscribe to real-time vote events
  const { isConnected: isSocketConnected } = useVoteEvents(proposalId, {
    onVoteCast: handleVoteCast,
    onTallyUpdated: handleTallyUpdated,
  });

  // Calculate effective voting power (own + received delegations)
  const ownVotingPower = holder?.votingPower || 0;
  const receivedDelegations = delegations?.delegatedFrom || [];
  const delegatedVotingPower = receivedDelegations.reduce((sum, d) => sum + d.weight, 0);
  const effectiveVotingPower = ownVotingPower + delegatedVotingPower;

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async (choice: 'for' | 'against' | 'abstain') => {
      if (!address) throw new Error('Wallet not connected');

      // Cast a vote in 3 steps: fetch EIP-712 typed data → sign it with the
      // connected wallet → submit with the signature. The signature proves the
      // voter controls this wallet (prevents forging votes for other addresses
      // and replays); the underlying voting power is still simulated demo data.
      const nonce =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const tdRes = await fetch(
        `${API_URL}/api/token/voting/${proposalId}/typed-data?voter=${address}&choice=${choice}&nonce=${nonce}`
      );
      if (!tdRes.ok) {
        const error = await tdRes.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to prepare vote signature');
      }
      const typedData = await tdRes.json();
      const issuedAt = typedData.message.issuedAt as number;

      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      const res = await fetch(`${API_URL}/api/token/voting/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          choice,
          reason: reason || undefined,
          signature,
          nonce,
          issuedAt,
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
      toast.success('Vote cast');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't cast vote");
    },
  });

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="flex items-center gap-3 text-agora-muted">
          <Wallet className="h-5 w-5" />
          <span className="text-sm">{tVoting('connectToVote')}</span>
        </div>
      </div>
    );
  }

  if (checkingVote) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="flex items-center justify-center gap-2 text-agora-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{tVoting('loading')}</span>
        </div>
      </div>
    );
  }

  if (existingVote) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center">
          <p className="text-sm text-agora-muted mb-2">{tVoting('alreadyVoted')}</p>
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            existingVote.choice === 'for' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
            existingVote.choice === 'against' ? 'bg-red-500/20 text-red-700 dark:text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {existingVote.choice === 'for' && <ThumbsUp className="h-4 w-4" />}
            {existingVote.choice === 'against' && <ThumbsDown className="h-4 w-4" />}
            {existingVote.choice === 'abstain' && <MinusCircle className="h-4 w-4" />}
            {t(existingVote.choice)} ({existingVote.votingPower.toLocaleString()} {tVoting('votingPower')})
          </div>
        </div>
      </div>
    );
  }

  if (!holder?.isVerified) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm mb-2">{tVoting('walletNotVerified')}</p>
          <p className="text-xs">{tVoting('verifyToVote')}</p>
        </div>
      </div>
    );
  }

  if (!votingInfo) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm">{tVoting('votingNotInitialized')}</p>
        </div>
      </div>
    );
  }

  const isVotingActive = votingInfo.status === 'active' && new Date(votingInfo.votingEndsAt) > new Date();

  if (!isVotingActive) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="text-center text-agora-muted">
          <p className="text-sm">{tVoting('votingEnded')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
      {/* Real-time connection indicator */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-agora-text">{tVoting('castYourVote')}</h4>
        <div className="flex items-center gap-1.5 text-xs">
          <Radio className={`h-3 w-3 ${isSocketConnected ? 'text-green-700 dark:text-green-400 animate-pulse' : 'text-agora-muted'}`} />
          <span className={isSocketConnected ? 'text-green-700 dark:text-green-400' : 'text-agora-muted'}>
            {isSocketConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Real-time vote notification */}
      {showVoteNotification && recentVote && (
        <div className="mb-4 animate-slide-up rounded-lg bg-agora-accent/10 border border-agora-accent/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-agora-accent font-medium">New Vote!</span>
            <span className="text-agora-muted">
              {recentVote.voter.slice(0, 6)}...{recentVote.voter.slice(-4)} voted{' '}
              <span className={
                recentVote.choice === 'for' ? 'text-green-700 dark:text-green-400' :
                recentVote.choice === 'against' ? 'text-red-700 dark:text-red-400' :
                'text-gray-400'
              }>
                {recentVote.choice}
              </span>
              {' '}with {recentVote.votingPower.toLocaleString()} power
            </span>
          </div>
        </div>
      )}

      {/* Voting Power Breakdown */}
      <div className="mb-4 rounded-lg bg-agora-darker p-3">
        <div className="mb-2 flex justify-end">
          <MockDataBadge />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-agora-muted">{tVoting('ownVotingPower')}:</span>
          <span className="text-agora-text font-medium">{ownVotingPower.toLocaleString()}</span>
        </div>
        {delegatedVotingPower > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="flex items-center gap-1 text-agora-muted">
              <Users className="h-3 w-3" />
              {tVoting('delegatedPower')} ({receivedDelegations.length}):
            </span>
            <span className="text-pink-700 dark:text-pink-400 font-medium">+{delegatedVotingPower.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-agora-border">
          <span className="text-agora-muted font-medium">{tVoting('effectivePower')}:</span>
          <span className="text-agora-primary font-bold">{effectiveVotingPower.toLocaleString()}</span>
        </div>
      </div>

      {/* Delegation Info */}
      {delegatedVotingPower > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-pink-500/10 p-3 text-xs text-pink-700 dark:text-pink-400">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{tVoting('delegationNote')}</span>
        </div>
      )}

      {/* Vote Options */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          onClick={() => setSelectedChoice('for')}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedChoice === 'for'
              ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border-agora-border hover:border-green-500/50 text-agora-muted hover:text-green-700 dark:hover:text-green-400'
          }`}
        >
          <ThumbsUp className="h-6 w-6" />
          <span className="text-sm font-medium">{t('for')}</span>
        </button>

        <button
          onClick={() => setSelectedChoice('against')}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedChoice === 'against'
              ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
              : 'border-agora-border hover:border-red-500/50 text-agora-muted hover:text-red-700 dark:hover:text-red-400'
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
        <label className="block text-sm text-agora-muted mb-2">{tVoting('reasonOptional')}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={tVoting('reasonPlaceholder')}
          className="w-full rounded-lg border border-agora-border bg-agora-darker px-3 py-2 text-sm text-agora-text placeholder-agora-muted focus:border-agora-primary focus:outline-none resize-none"
          rows={2}
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={() => selectedChoice && voteMutation.mutate(selectedChoice)}
        disabled={!selectedChoice || voteMutation.isPending}
        className="w-full rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {voteMutation.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tVoting('castingVote')}
          </span>
        ) : (
          tVoting('castVote')
        )}
      </button>

      {voteMutation.isError && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">{voteMutation.error.message}</p>
      )}
    </div>
  );
}
