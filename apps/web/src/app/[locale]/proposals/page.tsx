'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Filter,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Vote,
  TrendingUp,
} from 'lucide-react';

import { ProposalCard } from '@/components/proposals/ProposalCard';

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

const STATUSES = ['all', 'active', 'passed', 'rejected', 'executed', 'draft'] as const;

// Mock data for demo
const mockProposals: Proposal[] = [
  {
    id: 'PROP-001',
    title: 'Implement Emergency Security Patch v2.5.1',
    summary: 'Deploy critical security update to address token approval vulnerability. This proposal authorizes immediate deployment of the patched contract.',
    status: 'active',
    issueId: '2',
    votesFor: 127500,
    votesAgainst: 23400,
    votesAbstain: 8100,
    quorum: 100000,
    endDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    author: 'Security Council',
  },
  {
    id: 'PROP-002',
    title: 'Treasury Diversification: Allocate 20% to Stablecoins',
    summary: 'Proposal to convert 20% of treasury holdings to a mix of USDC and DAI to reduce volatility exposure.',
    status: 'active',
    issueId: '3',
    votesFor: 89300,
    votesAgainst: 67200,
    votesAbstain: 12500,
    quorum: 100000,
    endDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    created_at: new Date(Date.now() - 172800000).toISOString(),
    author: 'Treasury Committee',
  },
  {
    id: 'PROP-003',
    title: 'Increase Staking Rewards by 15%',
    summary: 'Adjust staking reward parameters to increase APY from current 8% to 9.2% to remain competitive.',
    status: 'passed',
    votesFor: 234000,
    votesAgainst: 45000,
    votesAbstain: 21000,
    quorum: 100000,
    endDate: new Date(Date.now() - 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 604800000).toISOString(),
    author: 'Community Working Group',
  },
  {
    id: 'PROP-004',
    title: 'Reduce Transaction Fee to 0.1%',
    summary: 'Lower platform transaction fee from 0.3% to 0.1% to increase trading volume and user adoption.',
    status: 'rejected',
    votesFor: 56000,
    votesAgainst: 178000,
    votesAbstain: 34000,
    quorum: 100000,
    endDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    created_at: new Date(Date.now() - 864000000).toISOString(),
    author: 'anonymous',
  },
  {
    id: 'PROP-005',
    title: 'Grant Program: Developer Ecosystem Fund',
    summary: 'Establish a $500,000 grant program to fund developer tools, documentation, and ecosystem projects.',
    status: 'executed',
    votesFor: 312000,
    votesAgainst: 28000,
    votesAbstain: 15000,
    quorum: 100000,
    endDate: new Date(Date.now() - 86400000 * 14).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 21).toISOString(),
    author: 'Development Council',
  },
];

export default function ProposalsPage() {
  const t = useTranslations('Proposals');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return mockProposals;
    },
  });

  const filteredProposals = proposals?.filter((proposal) => {
    const matchesStatus = selectedStatus === 'all' || proposal.status === selectedStatus;
    const matchesSearch =
      !searchQuery ||
      proposal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proposal.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proposal.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = {
    active: proposals?.filter((p) => p.status === 'active').length || 0,
    passed: proposals?.filter((p) => p.status === 'passed').length || 0,
    rejected: proposals?.filter((p) => p.status === 'rejected').length || 0,
    executed: proposals?.filter((p) => p.status === 'executed').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-white transition-colors hover:bg-agora-primary/80">
          <Plus className="h-4 w-4" />
          {t('createProposal')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-primary">
            <Vote className="h-4 w-4" />
            <span className="text-sm">{t('stats.active')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.active}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.passed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.passed}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-error">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.rejected')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.rejected}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-accent">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">{t('stats.executed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.executed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agora-muted" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-agora-border bg-agora-card py-2 pl-10 pr-4 text-white placeholder-agora-muted focus:border-agora-primary focus:outline-none focus:ring-1 focus:ring-agora-primary"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-agora-muted" />
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedStatus === status
                    ? 'bg-agora-primary text-white'
                    : 'bg-agora-card text-agora-muted hover:bg-agora-border'
                }`}
              >
                {t(`status.${status}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Proposal List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-agora-border bg-agora-card"
            />
          ))}
        </div>
      ) : filteredProposals?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-agora-border p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-agora-muted/50" />
          <h3 className="mt-4 text-lg font-semibold text-white">{t('noProposals')}</h3>
          <p className="mt-2 text-sm text-agora-muted">{t('noProposalsDesc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals?.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
