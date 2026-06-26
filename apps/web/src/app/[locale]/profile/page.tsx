'use client';

import { useAccount, useSignMessage } from 'wagmi';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Vote, History, Shield, Loader2, RefreshCw, CheckCircle, Copy, ExternalLink, AlertCircle, Users, FileText, TrendingUp, Award, Activity } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { DelegationStats, DelegationList, DelegationModal } from '@/components/delegation';
import { VoteHistoryList, type VoteHistoryItem } from '@/components/voting';
import { fetchDelegations, revokeDelegation, type DelegationResponse } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface VoteHistory {
  proposal_id: string;
  proposal_title?: string;
  created_at: string;
  choice: 'for' | 'against' | 'abstain';
  voting_power: number;
}

interface Proposal {
  id: string;
  title: string;
  status: string;
  created_at: string;
  votes_for: number;
  votes_against: number;
}

type TabType = 'overview' | 'proposals' | 'voting' | 'delegation';

export default function ProfilePage() {
  const t = useTranslations('Treasury');
  const tWallet = useTranslations('Wallet');
  const tDelegation = useTranslations('Delegation');
  const tVoting = useTranslations('Voting');
  const tGuide = useTranslations('Guide.tooltips');
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

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
      toast.success('Wallet verified');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
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
      toast.success('Delegation revoked');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke delegation");
    },
  });

  // Fetch user's proposals (proposals they submitted)
  const { data: userProposals } = useQuery<Proposal[]>({
    queryKey: ['user-proposals', address],
    queryFn: async () => {
      // This is a placeholder - in a real implementation you'd filter by submitter
      const res = await fetch(`${API_URL}/api/proposals?limit=10`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.proposals || [];
    },
    enabled: isConnected && !!address && !!profile?.holder,
  });

  // Calculate delegation stats
  const delegatedIn = delegations?.delegatedFrom?.reduce((sum, d) => sum + d.weight, 0) || 0;
  const delegatedOut = delegations?.delegatedTo?.reduce((sum, d) => sum + d.weight, 0) || 0;
  const ownVotingPower = profile?.holder?.votingPower || 0;
  const effectiveVotingPower = ownVotingPower + delegatedIn - delegatedOut;

  // Calculate contribution stats
  const totalVotes = profile?.votingHistory?.length || 0;
  const _proposalsSubmitted = userProposals?.length || 0;
  const delegationsReceived = delegations?.delegatedFrom?.length || 0;

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

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'proposals', label: 'My Proposals', icon: FileText },
    { key: 'voting', label: 'Voting History', icon: History },
    { key: 'delegation', label: 'Delegation', icon: Users },
  ];

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center py-20 sm:py-28">
        <div className="text-center">
          <Wallet className="mx-auto h-16 w-16 text-agora-muted" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Connect Your Wallet</h2>
          <p className="mt-2 text-agora-muted">Connect your wallet to view your profile and voting history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h1>
          <p className="text-agora-muted">Your token holdings and governance activity</p>
        </div>
        <button
          onClick={() => refetchProfile()}
          disabled={loadingProfile}
          className="flex items-center gap-2 rounded-lg bg-agora-card dark:bg-agora-dark-card border border-agora-border dark:border-agora-dark-border px-4 py-2 text-sm font-medium text-slate-900 dark:text-white transition-colors hover:bg-agora-border dark:hover:bg-agora-dark-border disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingProfile ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Wallet Info */}
      <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agora-accent/20">
              <Wallet className="h-6 w-6 text-agora-accent" />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{tWallet('address')}</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-lg text-slate-900 dark:text-white">{formatAddress(address!)}</p>
                <button
                  onClick={copyAddress}
                  aria-label="Copy address"
                  className="rounded p-1 text-agora-muted hover:bg-agora-border dark:hover:bg-agora-dark-border hover:text-slate-900 dark:hover:text-white"
                >
                  {copied ? <CheckCircle className="h-4 w-4 text-green-700 dark:text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={`https://etherscan.io/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View on Etherscan"
                  className="rounded p-1 text-agora-muted hover:bg-agora-border dark:hover:bg-agora-dark-border hover:text-slate-900 dark:hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          {profile?.holder ? (
            <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-700 dark:text-green-400">
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
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            {verifyMutation.error.message}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      {profile?.holder && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
                <Wallet className="h-5 w-5 text-agora-accent" />
              </div>
              <div>
                <p className="text-xs text-agora-muted">{t('tokenBalance')}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatBalance(profile.holder.balance)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <Vote className="h-5 w-5 text-purple-700 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-agora-muted">{t('votingPower')}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {effectiveVotingPower.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <History className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-agora-muted">Votes Cast</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {totalVotes}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/20">
                <Users className="h-5 w-5 text-pink-700 dark:text-pink-400" />
              </div>
              <div>
                <p className="text-xs text-agora-muted">Delegations</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {delegationsReceived}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {profile?.holder && (
        <div className="border-b border-agora-border dark:border-agora-dark-border">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-agora-primary text-agora-primary'
                      : 'border-transparent text-agora-muted hover:border-agora-border hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Tab Content */}
      {profile?.holder && (
        <div>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Contribution Stats */}
              <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                  <Award className="h-5 w-5 text-agora-primary" />
                  Governance Contribution
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                    <p className="text-3xl font-bold text-agora-primary">{totalVotes}</p>
                    <p className="text-sm text-agora-muted mt-1">Total Votes</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{delegationsReceived}</p>
                    <p className="text-sm text-agora-muted mt-1">Delegations Received</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-agora-darker dark:bg-agora-dark-darker">
                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{delegatedIn.toLocaleString()}</p>
                    <p className="text-sm text-agora-muted mt-1">Delegated Power</p>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-green-700 dark:text-green-400" />
                  Recent Voting Activity
                </h3>
                <VoteHistoryList
                  votes={
                    profile?.votingHistory?.slice(0, 5).map((vote: VoteHistory): VoteHistoryItem => ({
                      id: `${vote.proposal_id}-${vote.created_at}`,
                      proposalId: vote.proposal_id,
                      proposalTitle: vote.proposal_title || `Proposal ${vote.proposal_id}`,
                      choice: vote.choice,
                      votingPower: vote.voting_power,
                      votedAt: vote.created_at,
                    })) || []
                  }
                  isLoading={loadingProfile}
                />
                {profile?.votingHistory && profile.votingHistory.length > 5 && (
                  <button
                    onClick={() => setActiveTab('voting')}
                    className="mt-4 text-sm text-agora-accent hover:underline"
                  >
                    View all {profile.votingHistory.length} votes →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Proposals Tab */}
          {activeTab === 'proposals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-700 dark:text-blue-400" />
                  My Proposals
                </h3>
                <Link
                  href={`/${locale}/proposals` as never}
                  className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
                >
                  Create Proposal
                </Link>
              </div>

              {userProposals && userProposals.length > 0 ? (
                <div className="space-y-3">
                  {userProposals.map((proposal) => (
                    <Link
                      key={proposal.id}
                      href={`/${locale}/proposals` as never}
                      className="block rounded-xl border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card p-4 hover:border-agora-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-white">{proposal.title}</h4>
                          <p className="text-xs text-agora-muted mt-1">
                            Created {new Date(proposal.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          proposal.status === 'active' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                          proposal.status === 'passed' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                          proposal.status === 'rejected' ? 'bg-red-500/10 text-red-700 dark:text-red-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {proposal.status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-agora-muted">
                        <span className="text-green-700 dark:text-green-400">{proposal.votes_for} For</span>
                        <span className="text-red-700 dark:text-red-400">{proposal.votes_against} Against</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-agora-border dark:border-agora-dark-border p-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-agora-muted" />
                  <h4 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">No Proposals Yet</h4>
                  <p className="mt-2 text-sm text-agora-muted">
                    You haven't submitted any proposals. Start participating in governance!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Voting History Tab */}
          {activeTab === 'voting' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-700 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{tVoting('voteHistory')}</h3>
              </div>
              <VoteHistoryList
                votes={
                  profile?.votingHistory?.map((vote: VoteHistory): VoteHistoryItem => ({
                    id: `${vote.proposal_id}-${vote.created_at}`,
                    proposalId: vote.proposal_id,
                    proposalTitle: vote.proposal_title || `Proposal ${vote.proposal_id}`,
                    choice: vote.choice,
                    votingPower: vote.voting_power,
                    votedAt: vote.created_at,
                  })) || []
                }
                isLoading={loadingProfile}
              />
            </div>
          )}

          {/* Delegation Tab */}
          {activeTab === 'delegation' && (
            <div className="space-y-4">
              {/* Delegation Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{tDelegation('title')}</h3>
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
        </div>
      )}

      {/* Empty State */}
      {!profile?.holder && !loadingProfile && (
        <div className="rounded-xl border border-dashed border-agora-border dark:border-agora-dark-border p-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-agora-muted" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">Verify Your Wallet</h3>
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
