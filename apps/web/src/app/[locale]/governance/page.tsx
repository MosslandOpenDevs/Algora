'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  FileText,
  Vote,
  Lock,
  Workflow,
  RefreshCw,
  Heart,
  Cpu,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

import {
  fetchGovernanceOSStats,
  fetchGovernanceOSHealth,
  fetchDocuments,
  fetchDualHouseVotes,
  fetchLockedActions,
  fetchWorkflowStatuses,
  type GovernanceOSStats,
  type GovernanceOSHealth,
  type GovernanceDocument,
  type DualHouseVote,
  type LockedAction,
  type WorkflowStatus,
} from '@/lib/api';
import { PipelineVisualization } from '@/components/governance/PipelineVisualization';
import { WorkflowCard } from '@/components/governance/WorkflowCard';
import { DocumentCard } from '@/components/governance/DocumentCard';
import { DualHouseVoteCard } from '@/components/governance/DualHouseVoteCard';
import { LockedActionCard } from '@/components/governance/LockedActionCard';
import { DocumentDetailModal } from '@/components/governance/DocumentDetailModal';
import { WorkflowDetailModal } from '@/components/governance/WorkflowDetailModal';
import { VoteDetailModal } from '@/components/governance/VoteDetailModal';
import { ApprovalDetailModal } from '@/components/governance/ApprovalDetailModal';
import { StatsDetailModal } from '@/components/governance/StatsDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { WittyLoader, WittyEmptyState } from '@/components/ui/WittyLoader';

type TabKey = 'overview' | 'workflows' | 'documents' | 'voting' | 'approvals';

export default function GovernancePage() {
  const t = useTranslations('Governance');
  const tGuide = useTranslations('Guide.tooltips');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Modal state
  const [selectedDocument, setSelectedDocument] = useState<GovernanceDocument | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowStatus | null>(null);
  const [selectedVote, setSelectedVote] = useState<DualHouseVote | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<LockedAction | null>(null);
  const [selectedStatsType, setSelectedStatsType] = useState<'uptime' | 'pipelines' | 'documents' | 'locked' | null>(null);

  // Fetch all data
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<GovernanceOSStats>({
    queryKey: ['governance-stats'],
    queryFn: fetchGovernanceOSStats,
    refetchInterval: 30000,
  });

  const { data: health, isLoading: healthLoading } = useQuery<GovernanceOSHealth>({
    queryKey: ['governance-health'],
    queryFn: fetchGovernanceOSHealth,
    refetchInterval: 10000,
  });

  const { data: workflows, isLoading: workflowsLoading } = useQuery<WorkflowStatus[]>({
    queryKey: ['workflow-statuses'],
    queryFn: fetchWorkflowStatuses,
    refetchInterval: 30000,
  });

  const { data: documents, isLoading: documentsLoading } = useQuery<GovernanceDocument[]>({
    queryKey: ['governance-documents'],
    queryFn: () => fetchDocuments(undefined, undefined, 20),
    refetchInterval: 30000,
  });

  const { data: votes, isLoading: votesLoading } = useQuery<DualHouseVote[]>({
    queryKey: ['dual-house-votes'],
    queryFn: () => fetchDualHouseVotes(),
    refetchInterval: 30000,
  });

  const { data: lockedActions, isLoading: lockedLoading } = useQuery<LockedAction[]>({
    queryKey: ['locked-actions'],
    queryFn: () => fetchLockedActions(),
    refetchInterval: 30000,
  });

  const isLoading = statsLoading || healthLoading;

  const tabs: { key: TabKey; icon: React.ElementType; label: string }[] = [
    { key: 'overview', icon: Activity, label: t('tabs.overview') },
    { key: 'workflows', icon: Workflow, label: t('tabs.workflows') },
    { key: 'documents', icon: FileText, label: t('tabs.documents') },
    { key: 'voting', icon: Vote, label: t('tabs.voting') },
    { key: 'approvals', icon: Lock, label: t('tabs.approvals') },
  ];

  const getHealthStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'text-agora-success';
      case 'degraded':
        return 'text-agora-warning';
      case 'unhealthy':
        return 'text-agora-error';
      default:
        return 'text-agora-muted';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('governance')} />
            {health && (
              <span
                className={`ml-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getHealthStatusColor(health.status)} bg-current/10`}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      health.status === 'healthy' ? 'bg-agora-success' : 'bg-agora-warning'
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      health.status === 'healthy' ? 'bg-agora-success' : 'bg-agora-warning'
                    }`}
                  />
                </span>
                {t(`health.${health.status}`)}
              </span>
            )}
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => refetchStats()}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-slate-900 transition-colors hover:bg-agora-border"
        >
          <RefreshCw className="h-4 w-4" />
          {t('refresh')}
        </button>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-agora-border bg-agora-card"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <button
            onClick={() => setSelectedStatsType('uptime')}
            className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30 cursor-pointer text-left"
            style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-agora-muted">
              <Heart className="h-4 w-4" />
              <span className="text-sm">{t('stats.uptime')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats?.uptime ? `${Math.floor(stats.uptime / 3600)}h` : '--'}
            </p>
          </button>
          <button
            onClick={() => setSelectedStatsType('pipelines')}
            className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-success/30 cursor-pointer text-left"
            style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-agora-success">
              <Cpu className="h-4 w-4" />
              <span className="text-sm">{t('stats.pipelines')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats?.pipelinesRunning ?? 0}
            </p>
            <p className="text-xs text-agora-muted">
              {stats?.pipelinesCompleted ?? 0} {t('stats.completed')}
            </p>
          </button>
          <button
            onClick={() => setSelectedStatsType('documents')}
            className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-accent/30 cursor-pointer text-left"
            style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-agora-accent">
              <FileText className="h-4 w-4" />
              <span className="text-sm">{t('stats.documents')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats?.documentsPublished ?? 0}
            </p>
          </button>
          <button
            onClick={() => setSelectedStatsType('locked')}
            className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-warning/30 cursor-pointer text-left"
            style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-center gap-2 text-agora-warning">
              <Lock className="h-4 w-4" />
              <span className="text-sm">{t('stats.locked')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats?.lockedActions ?? 0}
            </p>
          </button>
        </div>
      )}

      {/* Pipeline Visualization */}
      <PipelineVisualization />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-agora-border pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-agora-primary text-slate-900'
                  : 'text-agora-muted hover:bg-agora-card hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2 animate-fade-in">
          {/* Recent Activity */}
          <div className="rounded-lg border border-agora-border bg-agora-card p-4 animate-slide-up" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <TrendingUp className="h-5 w-5 text-agora-primary" />
              {t('overview.recentWorkflows')}
            </h3>
            {workflowsLoading ? (
              <WittyLoader category="governance" size="md" />
            ) : workflows?.length === 0 ? (
              <p className="text-sm text-agora-muted">{t('overview.noWorkflows')}</p>
            ) : (
              <div className="space-y-3">
                {workflows?.slice(0, 3).map((wf, index) => (
                  <WorkflowCard
                    key={wf.type}
                    workflow={wf}
                    index={index}
                    onClick={() => setSelectedWorkflow(wf)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Active Votes */}
          <div className="rounded-lg border border-agora-border bg-agora-card p-4 animate-slide-up" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Vote className="h-5 w-5 text-agora-accent" />
              {t('overview.activeVotes')}
            </h3>
            {votesLoading ? (
              <WittyLoader category="governance" size="md" />
            ) : votes?.length === 0 ? (
              <p className="text-sm text-agora-muted">{t('overview.noVotes')}</p>
            ) : (
              <div className="space-y-3">
                {votes
                  ?.filter((v) => v.status === 'voting')
                  .slice(0, 2)
                  .map((vote, index) => (
                    <DualHouseVoteCard
                      key={vote.id}
                      vote={vote}
                      index={index}
                      onClick={() => setSelectedVote(vote)}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Pending Approvals */}
          <div className="rounded-lg border border-agora-border bg-agora-card p-4 lg:col-span-2 animate-slide-up" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Lock className="h-5 w-5 text-agora-warning" />
              {t('overview.pendingApprovals')}
            </h3>
            {lockedLoading ? (
              <WittyLoader category="governance" size="md" />
            ) : lockedActions?.filter((a) => a.status === 'locked').length === 0 ? (
              <div className="flex items-center gap-2 text-agora-success">
                <CheckCircle className="h-5 w-5" />
                <span>{t('overview.noLocked')}</span>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {lockedActions
                  ?.filter((a) => a.status === 'locked')
                  .slice(0, 4)
                  .map((action, index) => (
                    <LockedActionCard
                      key={action.id}
                      action={action}
                      index={index}
                      onClick={() => setSelectedApproval(action)}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'workflows' && (
        <div className="space-y-4 animate-fade-in">
          {workflowsLoading ? (
            <WittyLoader category="governance" size="lg" />
          ) : workflows?.length === 0 ? (
            <WittyEmptyState
              type="workflows"
              icon={<Workflow className="h-12 w-12" />}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workflows?.map((wf, index) => (
                <WorkflowCard
                  key={wf.type}
                  workflow={wf}
                  index={index}
                  onClick={() => setSelectedWorkflow(wf)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4 animate-fade-in">
          {documentsLoading ? (
            <WittyLoader category="governance" size="lg" />
          ) : documents?.length === 0 ? (
            <WittyEmptyState
              type="documents"
              icon={<FileText className="h-12 w-12" />}
            />
          ) : (
            <div className="space-y-3">
              {documents?.map((doc, index) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  index={index}
                  onClick={() => setSelectedDocument(doc)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'voting' && (
        <div className="space-y-4 animate-fade-in">
          {votesLoading ? (
            <WittyLoader category="governance" size="lg" />
          ) : votes?.length === 0 ? (
            <WittyEmptyState
              type="votes"
              icon={<Vote className="h-12 w-12" />}
            />
          ) : (
            <div className="space-y-3">
              {votes?.map((vote, index) => (
                <DualHouseVoteCard
                  key={vote.id}
                  vote={vote}
                  index={index}
                  onClick={() => setSelectedVote(vote)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="space-y-4 animate-fade-in">
          {lockedLoading ? (
            <WittyLoader category="governance" size="lg" />
          ) : lockedActions?.length === 0 ? (
            <WittyEmptyState
              type="approvals"
              icon={<Lock className="h-12 w-12" />}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {lockedActions?.map((action, index) => (
                <LockedActionCard
                  key={action.id}
                  action={action}
                  index={index}
                  onClick={() => setSelectedApproval(action)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedDocument && (
        <DocumentDetailModal
          document={selectedDocument}
          isOpen={!!selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}

      {selectedWorkflow && (
        <WorkflowDetailModal
          workflow={selectedWorkflow}
          isOpen={!!selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}

      {selectedVote && (
        <VoteDetailModal
          vote={selectedVote}
          isOpen={!!selectedVote}
          onClose={() => setSelectedVote(null)}
        />
      )}

      {selectedApproval && (
        <ApprovalDetailModal
          action={selectedApproval}
          isOpen={!!selectedApproval}
          onClose={() => setSelectedApproval(null)}
        />
      )}

      {selectedStatsType && stats && (
        <StatsDetailModal
          type={selectedStatsType}
          stats={stats}
          health={health}
          isOpen={!!selectedStatsType}
          onClose={() => setSelectedStatsType(null)}
        />
      )}
    </div>
  );
}
