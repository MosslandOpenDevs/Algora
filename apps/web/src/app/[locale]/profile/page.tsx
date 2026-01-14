'use client';

import { useAccount, useSignMessage } from 'wagmi';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Vote, History, Shield, Loader2, RefreshCw, CheckCircle, Copy, ExternalLink, AlertCircle, Users } from 'lucide-react';
import { useState } from 'react';

import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { DelegationStats, DelegationList, DelegationModal } from '@/components/delegation';
import { fetchDelegations, revokeDelegation, type DelegationResponse } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface VoteHistory {
  proposal_id: string;
  proposal_title?: string;
  created_at: string;
  choice: 'for' | 'against' | 'abstain';
  voting_power: number;
}

export default function ProfilePage() {
  const t = useTranslations('Treasury');
  const tWallet = useTranslations('Wallet');
  const tDelegation = useTranslations('Delegation');
  const tGuide = useTranslations('Guide.tooltips');
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);

  // Get holder profile
  const { data: profile, isLoading: loadingProfile, refetch: refetchProfile } = useQuery({
    queryKey: ['holder-profile', address],
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch(`${API_URL}/api/token/holders/${address}/profile`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isConnected && !!address,
  });

  // Get verification nonce
  const verifyMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Request verification nonce
      const requestRes = await fetch(`${API_URL}/api/token/verify/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
      const { nonce, message } = await requestRes.json();

      // Step 2: Sign the message
      const signature = await signMessageAsync({ message });

      // Step 3: Submit verification
      const confirmRes = await fetch(`${API_URL}/api/token/verify/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, signature, nonce }),
      });

      if (!confirmRes.ok) {
        const error = await confirmRes.json();
        throw new Error(error.error || 'Verification failed');
      }

      return confirmRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holder-profile', address] });
    },
  });

  // Delegation queries
  const { data: delegations, isLoading: loadingDelegations } = useQuery<DelegationResponse>({
    queryKey: ['delegations', address],
    queryFn: () => fetchDelegations(address!),
    enabled: isConnected && !!address && !!profile?.holder,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeDelegation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegations', address] });
    },
  });

  // Calculate delegation stats
  const delegatedIn = delegations?.delegatedFrom?.reduce((sum, d) => sum + d.weight, 0) || 0;
  const delegatedOut = delegations?.delegatedTo?.reduce((sum, d) => sum + d.weight, 0) || 0;
  const ownVotingPower = profile?.holder?.votingPower || 0;
  const effectiveVotingPower = ownVotingPower + delegatedIn - delegatedOut;

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Wallet className="mx-auto h-16 w-16 text-agora-muted" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Connect Your Wallet</h2>
          <p className="mt-2 text-agora-muted">Connect your wallet to view your profile and voting history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-agora-muted">Your token holdings and voting history</p>
        </div>
        <button
          onClick={() => refetchProfile()}
          disabled={loadingProfile}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingProfile ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Wallet Info */}
      <div className="rounded-xl border border-agora-border bg-agora-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agora-accent/20">
              <Wallet className="h-6 w-6 text-agora-accent" />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{tWallet('address')}</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-lg text-slate-900">{formatAddress(address!)}</p>
                <button
                  onClick={copyAddress}
                  className="rounded p-1 text-agora-muted hover:bg-agora-border hover:text-slate-900"
                >
                  {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={`https://etherscan.io/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-agora-muted hover:bg-agora-border hover:text-slate-900"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          {profile?.holder ? (
            <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
              <Shield className="h-4 w-4" />
              Verified
            </div>
          ) : (
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80 disabled:opacity-50"
            >
              {verifyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Verify Wallet
                </>
              )}
            </button>
          )}
        </div>

        {verifyMutation.isError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            {verifyMutation.error.message}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      {profile?.holder && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-agora-border bg-agora-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
                <Wallet className="h-5 w-5 text-agora-accent" />
              </div>
              <div>
                <p className="text-sm text-agora-muted">{t('tokenBalance')}</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatBalance(profile.holder.balance)} MOC
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-agora-border bg-agora-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <Vote className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-agora-muted">{t('votingPower')}</p>
                <p className="text-xl font-bold text-slate-900">
                  {profile.holder.votingPower.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-agora-border bg-agora-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <History className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-agora-muted">Votes Cast</p>
                <p className="text-xl font-bold text-slate-900">
                  {profile.votingHistory?.length || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delegation Section */}
      {profile?.holder && (
        <div className="space-y-4">
          {/* Delegation Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{tDelegation('title')}</h2>
              <HelpTooltip content={tGuide('delegation')} />
            </div>
            <button
              onClick={() => setShowDelegationModal(true)}
              className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-accent/90"
            >
              <Users className="h-4 w-4" />
              {tDelegation('delegate')}
            </button>
          </div>
          <p className="text-sm text-agora-muted">{tDelegation('subtitle')}</p>

          {/* Delegation Stats */}
          <DelegationStats
            ownVotingPower={ownVotingPower}
            delegatedIn={delegatedIn}
            delegatedOut={delegatedOut}
            effectiveVotingPower={effectiveVotingPower}
          />

          {/* Delegation List */}
          <DelegationList
            delegations={delegations || { delegatedTo: [], delegatedFrom: [] }}
            onRevoke={(id) => revokeMutation.mutate(id)}
            isLoading={loadingDelegations}
            isRevoking={revokeMutation.isPending}
          />
        </div>
      )}

      {/* Voting History */}
      {profile?.votingHistory && profile.votingHistory.length > 0 && (
        <div className="rounded-xl border border-agora-border bg-agora-card">
          <div className="border-b border-agora-border p-4">
            <h3 className="font-semibold text-slate-900">Voting History</h3>
          </div>
          <div className="divide-y divide-agora-border">
            {profile.votingHistory.map((vote: VoteHistory) => (
              <div key={vote.proposal_id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900">{vote.proposal_title || vote.proposal_id}</p>
                  <p className="text-sm text-agora-muted">
                    {new Date(vote.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    vote.choice === 'for' ? 'bg-green-500/20 text-green-400' :
                    vote.choice === 'against' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {vote.choice}
                  </span>
                  <span className="text-sm text-agora-muted">
                    {vote.voting_power.toLocaleString()} VP
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!profile?.holder && !loadingProfile && (
        <div className="rounded-xl border border-dashed border-agora-border p-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-agora-muted" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Verify Your Wallet</h3>
          <p className="mt-2 text-sm text-agora-muted">
            Verify your wallet to see your token balance and participate in governance voting
          </p>
        </div>
      )}

      {/* Delegation Modal */}
      <DelegationModal
        isOpen={showDelegationModal}
        onClose={() => setShowDelegationModal(false)}
        walletAddress={address || ''}
        votingPower={ownVotingPower}
      />
    </div>
  );
}
