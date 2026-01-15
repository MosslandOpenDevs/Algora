'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Coins, Users, Vote, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';

import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { MockDataBadge } from '@/components/ui/MockDataBadge';
import {
  AllocationCard,
  TransactionCard,
  HolderCard,
  BalanceDistributionChart,
  AllocationStatusBreakdown,
  SpendingLimitsCard,
  AllocationDetailModal,
  TransactionDetailModal,
} from '@/components/treasury';
import type { BudgetAllocation, TreasuryTransaction, TokenHolder } from '@/components/treasury';
import { useSocket } from '@/hooks/useSocket';
import {
  fetchTreasuryDashboard,
  fetchTreasuryAllocations,
  fetchTreasuryTransactions,
  fetchSpendingLimits,
  fetchTokenHolders,
  type TreasuryDashboard,
  type SpendingLimit,
} from '@/lib/api';

type TabKey = 'overview' | 'allocations' | 'transactions' | 'holders';

export default function TreasuryPage() {
  const t = useTranslations('Treasury');
  const tGuide = useTranslations('Guide.tooltips');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Modal state
  const [selectedAllocation, setSelectedAllocation] = useState<BudgetAllocation | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TreasuryTransaction | null>(null);

  // WebSocket
  const { isConnected } = useSocket();

  // Main dashboard query
  const {
    data: dashboard,
    isLoading,
    refetch,
  } = useQuery<TreasuryDashboard>({
    queryKey: ['treasury-dashboard'],
    queryFn: fetchTreasuryDashboard,
    refetchInterval: 30000,
  });

  // Spending limits query
  const { data: spendingLimits } = useQuery<SpendingLimit[]>({
    queryKey: ['treasury-limits'],
    queryFn: fetchSpendingLimits,
    enabled: activeTab === 'overview',
  });

  // Allocations query
  const { data: allocations } = useQuery<BudgetAllocation[]>({
    queryKey: ['treasury-allocations'],
    queryFn: () => fetchTreasuryAllocations(),
    enabled: activeTab === 'allocations' || activeTab === 'overview',
  });

  // Transactions query
  const { data: transactions } = useQuery<TreasuryTransaction[]>({
    queryKey: ['treasury-transactions'],
    queryFn: () => fetchTreasuryTransactions(),
    enabled: activeTab === 'transactions',
  });

  // Holders query
  const { data: holders } = useQuery<TokenHolder[]>({
    queryKey: ['token-holders'],
    queryFn: () => fetchTokenHolders(),
    enabled: activeTab === 'holders',
  });

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const balances = dashboard?.balances || [];
  const mocBalance = balances.find((b) => b.tokenSymbol === 'MOC');
  const ethBalance = balances.find((b) => b.tokenSymbol === 'ETH');

  // Calculate allocation stats for breakdown
  const allocationStats = {
    pending: allocations?.filter((a) => a.status === 'pending').length || 0,
    approved: allocations?.filter((a) => a.status === 'approved').length || 0,
    disbursed: allocations?.filter((a) => a.status === 'disbursed').length || 0,
    cancelled: allocations?.filter((a) => a.status === 'cancelled').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('treasury')} />
            {dashboard?.tokenInfo?.mockMode && <MockDataBadge />}
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              isConnected
                ? 'bg-agora-success/20 text-agora-success'
                : 'bg-agora-muted/20 text-agora-muted'
            }`}
          >
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? t('connected') : 'Offline'}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </button>
        </div>
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
      <div className="border-b border-agora-border overflow-x-auto scrollbar-hide">
        <div className="flex gap-4 sm:gap-6 min-w-max">
          {(['overview', 'allocations', 'transactions', 'holders'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
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
      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Charts Row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BalanceDistributionChart balances={balances} />
              <AllocationStatusBreakdown stats={allocationStats} />
            </div>

            {/* Spending Limits */}
            <SpendingLimitsCard limits={spendingLimits || []} />

            {/* Token Info & Voting Stats */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    <span className="text-agora-muted">Mode</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        dashboard?.tokenInfo?.mockMode
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {dashboard?.tokenInfo?.mockMode ? 'Mock' : 'Live'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-agora-border bg-agora-card p-6">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Voting Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-agora-muted">Total Votes</span>
                    <span className="text-slate-900">{dashboard?.voting?.totalVotes || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-agora-muted">Voting Power Used</span>
                    <span className="text-slate-900">
                      {dashboard?.voting?.totalVotingPowerUsed || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-agora-muted">Active Voting</span>
                    <span className="text-slate-900">{dashboard?.voting?.activeVoting || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-agora-muted">Completed</span>
                    <span className="text-slate-900">
                      {dashboard?.voting?.completedVoting || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'allocations' && (
          <div className="space-y-3">
            {allocations && allocations.length > 0 ? (
              allocations.map((allocation, index) => (
                <AllocationCard
                  key={allocation.id}
                  allocation={allocation}
                  onClick={() => setSelectedAllocation(allocation)}
                  index={index}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-agora-border bg-agora-card py-12">
                <Coins className="h-12 w-12 text-agora-muted" />
                <p className="mt-4 text-agora-muted">{t('noAllocations')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-3">
            {transactions && transactions.length > 0 ? (
              transactions.map((transaction, index) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  onClick={() => setSelectedTransaction(transaction)}
                  index={index}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-agora-border bg-agora-card py-12">
                <Coins className="h-12 w-12 text-agora-muted" />
                <p className="mt-4 text-agora-muted">{t('noTransactions')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'holders' && (
          <div className="space-y-3">
            {holders && holders.length > 0 ? (
              holders.map((holder, index) => (
                <HolderCard key={holder.id} holder={holder} index={index} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-agora-border bg-agora-card py-12">
                <Users className="h-12 w-12 text-agora-muted" />
                <p className="mt-4 text-agora-muted">{t('noHolders')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AllocationDetailModal
        allocation={selectedAllocation}
        isOpen={!!selectedAllocation}
        onClose={() => setSelectedAllocation(null)}
      />
      <TransactionDetailModal
        transaction={selectedTransaction}
        isOpen={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
