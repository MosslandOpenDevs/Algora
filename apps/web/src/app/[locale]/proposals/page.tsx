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
  XCircle,
  Vote,
  TrendingUp,
} from 'lucide-react';

import { ProposalCard } from '@/components/proposals/ProposalCard';
import { ProposalDetailModal } from '@/components/proposals/ProposalDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { fetchProposals, type Proposal as APIProposal, type ProposalStatus } from '@/lib/api';

// UI-specific proposal interface
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

// Map API status to UI status
function mapApiStatus(status: ProposalStatus): Proposal['status'] {
  switch (status) {
    case 'voting':
    case 'discussion':
    case 'pending_review':
      return 'active';
    case 'passed':
      return 'passed';
    case 'rejected':
    case 'cancelled':
      return 'rejected';
    case 'executed':
      return 'executed';
    case 'draft':
    default:
      return 'draft';
  }
}

// Transform API proposal to UI proposal
function transformProposal(apiProposal: APIProposal): Proposal {
  let votesFor = 0;
  let votesAgainst = 0;
  let votesAbstain = 0;

  if (apiProposal.tally) {
    try {
      const tally = JSON.parse(apiProposal.tally);
      votesFor = tally.for || 0;
      votesAgainst = tally.against || 0;
      votesAbstain = tally.abstain || 0;
    } catch {
      // Ignore parse errors
    }
  }

  return {
    id: apiProposal.id,
    title: apiProposal.title,
    summary: apiProposal.description,
    status: mapApiStatus(apiProposal.status),
    issueId: apiProposal.issue_id,
    votesFor,
    votesAgainst,
    votesAbstain,
    quorum: apiProposal.quorum_required || 100000,
    endDate: apiProposal.voting_ends || apiProposal.created_at,
    created_at: apiProposal.created_at,
    author: apiProposal.proposer,
  };
}

export default function ProposalsPage() {
  const t = useTranslations('Proposals');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const apiProposals = await fetchProposals();
      return apiProposals.map(transformProposal);
    },
    refetchInterval: 30000, // Refetch every 30 seconds
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('proposals')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80">
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
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.active}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.passed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.passed}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-error">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.rejected')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.rejected}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-accent">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">{t('stats.executed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.executed}</p>
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
            className="w-full rounded-lg border border-agora-border bg-agora-card py-2 pl-10 pr-4 text-slate-900 placeholder-agora-muted focus:border-agora-primary focus:outline-none focus:ring-1 focus:ring-agora-primary"
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
                    ? 'bg-agora-primary text-slate-900'
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
          <h3 className="mt-4 text-lg font-semibold text-slate-900">{t('noProposals')}</h3>
          <p className="mt-2 text-sm text-agora-muted">{t('noProposalsDesc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals?.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onClick={() => setSelectedProposal(proposal)}
            />
          ))}
        </div>
      )}

      {/* Proposal Detail Modal */}
      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </div>
  );
}
