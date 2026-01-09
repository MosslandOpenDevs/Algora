'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Coins, Users, Vote, FileText, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { HelpTooltip } from '@/components/guide/HelpTooltip';

interface TreasuryBalance {
  tokenAddress: string;
  tokenSymbol: string;
  balance: string;
  balanceFormatted: number;
}

interface TokenHolder {
  id: string;
  walletAddress: string;
  balance: string;
  votingPower: number;
  verifiedAt: string;
  isVerified: boolean;
}

interface Allocation {
  id: string;
  proposalId: string;
  category: string;
  tokenSymbol: string;
  amount: string;
  recipient: string;
  status: string;
  description: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  type: string;
  tokenSymbol: string;
  amount: string;
  fromAddress?: string;
  toAddress?: string;
  status: string;
  description: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export default function TreasuryPage() {
  const t = useTranslations('Treasury');
  const tGuide = useTranslations('Guide.tooltips');
  const [activeTab, setActiveTab] = useState<'overview' | 'allocations' | 'transactions' | 'holders'>('overview');

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ['treasury-dashboard'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/token/dashboard`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: holders } = useQuery({
    queryKey: ['token-holders'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/token/holders`);
      return res.json();
    },
    enabled: activeTab === 'holders',
  });

  const { data: allocations } = useQuery({
    queryKey: ['treasury-allocations'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/token/treasury/allocations`);
      return res.json();
    },
    enabled: activeTab === 'allocations',
  });

  const { data: transactions } = useQuery({
    queryKey: ['treasury-transactions'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/token/treasury/transactions`);
      return res.json();
    },
    enabled: activeTab === 'transactions',
  });

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const balances: TreasuryBalance[] = dashboard?.balances || [];
  const mocBalance = balances.find(b => b.tokenSymbol === 'MOC');
  const ethBalance = balances.find(b => b.tokenSymbol === 'ETH');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('treasury')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('overview')}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-agora-border bg-agora-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
              <Coins className="h-5 w-5 text-agora-accent" />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{t('stats.mocBalance')}</p>
              <p className="text-xl font-bold text-slate-900">
                {mocBalance ? mocBalance.balanceFormatted.toLocaleString() : '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-agora-border bg-agora-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
              <Coins className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{t('stats.ethBalance')}</p>
              <p className="text-xl font-bold text-slate-900">
                {ethBalance ? ethBalance.balanceFormatted.toLocaleString() : '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-agora-border bg-agora-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
              <Users className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{t('stats.holders')}</p>
              <p className="text-xl font-bold text-slate-900">
                {dashboard?.token?.holders?.verified || 0}
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
              <p className="text-sm text-agora-muted">{t('stats.activeVoting')}</p>
              <p className="text-xl font-bold text-slate-900">
                {dashboard?.voting?.activeVoting || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-agora-border">
        <div className="flex gap-6">
          {(['overview', 'allocations', 'transactions', 'holders'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-agora-accent text-slate-900'
                  : 'border-transparent text-agora-muted hover:text-slate-900'
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Token Info */}
          <div className="rounded-xl border border-agora-border bg-agora-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Token Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-agora-muted">Name</span>
                <span className="text-slate-900">{dashboard?.tokenInfo?.name || 'MOC'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Symbol</span>
                <span className="text-slate-900">{dashboard?.tokenInfo?.symbol || 'MOC'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Total Supply</span>
                <span className="text-slate-900">
                  {dashboard?.tokenInfo?.totalSupply
                    ? formatBalance(dashboard.tokenInfo.totalSupply)
                    : '0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Chain ID</span>
                <span className="text-slate-900">{dashboard?.tokenInfo?.chainId || 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Mode</span>
                <span className={`rounded px-2 py-0.5 text-xs ${
                  dashboard?.tokenInfo?.mockMode
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {dashboard?.tokenInfo?.mockMode ? 'Mock' : 'Live'}
                </span>
              </div>
            </div>
          </div>

          {/* Voting Stats */}
          <div className="rounded-xl border border-agora-border bg-agora-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Voting Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-agora-muted">Total Votes</span>
                <span className="text-slate-900">{dashboard?.voting?.totalVotes || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Voting Power Used</span>
                <span className="text-slate-900">{dashboard?.voting?.totalVotingPowerUsed || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Active Voting</span>
                <span className="text-slate-900">{dashboard?.voting?.activeVoting || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-agora-muted">Completed</span>
                <span className="text-slate-900">{dashboard?.voting?.completedVoting || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="rounded-xl border border-agora-border bg-agora-card">
          {allocations && allocations.length > 0 ? (
            <div className="divide-y divide-agora-border">
              {allocations.map((allocation: Allocation) => (
                <div key={allocation.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
                      <FileText className="h-5 w-5 text-agora-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{allocation.category}</p>
                      <p className="text-sm text-agora-muted">{allocation.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {formatBalance(allocation.amount)} {allocation.tokenSymbol}
                    </p>
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      allocation.status === 'disbursed' ? 'bg-green-500/20 text-green-400' :
                      allocation.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                      allocation.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {allocation.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-agora-muted" />
              <p className="mt-4 text-agora-muted">{t('noAllocations')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="rounded-xl border border-agora-border bg-agora-card">
          {transactions && transactions.length > 0 ? (
            <div className="divide-y divide-agora-border">
              {transactions.map((tx: Transaction) => (
                <div key={tx.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      tx.type === 'deposit' ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      {tx.type === 'deposit' ? (
                        <ArrowDownRight className="h-5 w-5 text-green-400" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{tx.type === 'deposit' ? t('transaction.deposit') : t('transaction.withdrawal')}</p>
                      <p className="text-sm text-agora-muted">{tx.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${
                      tx.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {tx.type === 'deposit' ? '+' : '-'}{formatBalance(tx.amount)} {tx.tokenSymbol}
                    </p>
                    <p className="text-xs text-agora-muted">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Coins className="h-12 w-12 text-agora-muted" />
              <p className="mt-4 text-agora-muted">{t('noTransactions')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'holders' && (
        <div className="rounded-xl border border-agora-border bg-agora-card">
          {holders && holders.length > 0 ? (
            <div className="divide-y divide-agora-border">
              {holders.map((holder: TokenHolder) => (
                <div key={holder.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
                      <Users className="h-5 w-5 text-agora-accent" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium text-slate-900">
                        {formatAddress(holder.walletAddress)}
                      </p>
                      <p className="text-sm text-agora-muted">
                        {t('verifiedAt')}: {new Date(holder.verifiedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {holder.votingPower.toLocaleString()} {t('votingPower')}
                    </p>
                    <p className="text-sm text-agora-muted">
                      {formatBalance(holder.balance)} MOC
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-agora-muted" />
              <p className="mt-4 text-agora-muted">{t('noHolders')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
