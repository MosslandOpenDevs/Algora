'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Vote,
  TrendingUp,
  User,
  Calendar,
  Target,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  ExternalLink,
  Share2,
  Wallet,
  Brain,
  History,
  AlertTriangle,
  Users,
  Lightbulb,
  Shield,
  Loader2,
  Bot,
  GitBranch,
  ArrowRight,
  Banknote,
  Link2,
  BookOpen,
  Flag,
  UserCheck,
  ClipboardList,
  Tag,
} from 'lucide-react';
import { TokenVoting } from './TokenVoting';
import { CopyableHash } from '@/components/ui/CopyableHash';
import {
  fetchDecisionPacket,
  fetchProposalVoteHistory,
  fetchIssue,
  fetchProposalHistory,
  generateDecisionPacket,
  type ProposalType,
  type ProposalContent,
  type ProposalBudget,
  type ProposalLink,
} from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { safeFormatDate } from '@/lib/utils';

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
  // Extended fields (v2)
  proposalType?: ProposalType;
  coProposers?: string[];
  version?: number;
  executionDate?: string;
  content?: ProposalContent;
  budget?: ProposalBudget;
  relatedLinks?: ProposalLink[];
}

interface ProposalDetailModalProps {
  proposal: Proposal;
  onClose: () => void;
}

type TabType = 'overview' | 'timeline' | 'decision' | 'votes' | 'issue';

const statusConfig = {
  draft: {
    icon: FileText,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    label: 'Draft',
  },
  active: {
    icon: Vote,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
    border: 'border-agora-primary/30',
    label: 'Active',
  },
  passed: {
    icon: CheckCircle,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
    label: 'Passed',
  },
  rejected: {
    icon: XCircle,
    color: 'text-agora-error',
    bg: 'bg-agora-error/10',
    border: 'border-agora-error/30',
    label: 'Rejected',
  },
  executed: {
    icon: TrendingUp,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
    label: 'Executed',
  },
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatAddress(addr: string): string {
  if (addr.startsWith('0x') && addr.length > 10) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return addr.length > 20 ? `${addr.slice(0, 17)}...` : addr;
}

export function ProposalDetailModal({ proposal, onClose }: ProposalDetailModalProps) {
  const t = useTranslations('Proposals');
  const tDetail = useTranslations('Proposals.detail');
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const StatusIcon = statusConfig[proposal.status].icon;
  const queryClient = useQueryClient();

  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const forPercent = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;
  const againstPercent = totalVotes > 0 ? (proposal.votesAgainst / totalVotes) * 100 : 0;
  const abstainPercent = totalVotes > 0 ? (proposal.votesAbstain / totalVotes) * 100 : 0;
  const quorumPercent = Math.min((totalVotes / proposal.quorum) * 100, 100);
  const quorumReached = totalVotes >= proposal.quorum;

  const isActive = proposal.status === 'active';
  const endDate = new Date(proposal.endDate);
  const hasEnded = endDate < new Date();

  // Fetch decision packet
  const { data: decisionPacket, isLoading: loadingPacket } = useQuery({
    queryKey: ['decision-packet', proposal.id],
    queryFn: () => fetchDecisionPacket(proposal.id),
    enabled: activeTab === 'decision',
  });

  // Fetch vote history
  const { data: voteHistory, isLoading: loadingVotes } = useQuery({
    queryKey: ['vote-history', proposal.id],
    queryFn: () => fetchProposalVoteHistory(proposal.id),
    enabled: activeTab === 'votes',
  });

  // Fetch related issue
  const { data: relatedIssue, isLoading: loadingIssue } = useQuery({
    queryKey: ['related-issue', proposal.issueId],
    queryFn: () => fetchIssue(proposal.issueId!),
    enabled: activeTab === 'issue' && !!proposal.issueId,
  });

  // Fetch proposal history/timeline
  const { data: proposalHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['proposal-history', proposal.id],
    queryFn: () => fetchProposalHistory(proposal.id),
    enabled: activeTab === 'timeline',
  });

  // Mutation for generating Decision Packet
  const generateMutation = useMutation({
    mutationFn: () => generateDecisionPacket(proposal.id, 'user'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-packet', proposal.id] });
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const tabs = [
    { id: 'overview' as TabType, label: tDetail('tabs.overview'), icon: FileText },
    { id: 'timeline' as TabType, label: tDetail('tabs.timeline'), icon: GitBranch },
    { id: 'decision' as TabType, label: tDetail('tabs.decision'), icon: Brain },
    { id: 'votes' as TabType, label: tDetail('tabs.votes'), icon: History },
    ...(proposal.issueId ? [{ id: 'issue' as TabType, label: tDetail('tabs.issue'), icon: ExternalLink }] : []),
  ];

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-agora-border p-4 sm:p-6 flex-shrink-0">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className={`rounded-lg border p-2 sm:p-3 flex-shrink-0 ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].border}`}>
              <StatusIcon className={`h-5 w-5 ${statusConfig[proposal.status].color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <CopyableHash hash={proposal.id} truncateLength={8} className="text-agora-muted" />
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}
                >
                  {t(`status.${proposal.status}`)}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 pr-8 line-clamp-2 break-words">{proposal.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-agora-muted">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate max-w-[100px] sm:max-w-none">{proposal.author}</span>
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  {safeFormatDate(proposal.created_at, (d) => format(d, 'PPP'))}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-agora-border bg-agora-darker/50 flex-shrink-0 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-agora-primary text-agora-primary'
                  : 'border-transparent text-agora-muted hover:text-slate-900'
              }`}
            >
              <tab.icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('header.title')}</h3>
                  </div>
                  {proposal.proposalType && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      {tDetail(`types.${proposal.proposalType}`)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="h-4 w-4 text-agora-muted flex-shrink-0" />
                    <span className="text-agora-muted flex-shrink-0">{tDetail('header.id')}:</span>
                    <CopyableHash hash={proposal.id} truncateLength={8} className="text-slate-900" />
                    {proposal.version && <span className="text-agora-muted">v{proposal.version}</span>}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-agora-muted flex-shrink-0" />
                    <span className="text-agora-muted flex-shrink-0">{tDetail('header.proposer')}:</span>
                    <span className="text-slate-900 truncate">{formatAddress(proposal.author)}</span>
                  </div>
                  {proposal.coProposers && proposal.coProposers.length > 0 && (
                    <div className="flex items-center gap-2 sm:col-span-2 min-w-0">
                      <Users className="h-4 w-4 text-agora-muted flex-shrink-0" />
                      <span className="text-agora-muted flex-shrink-0">{tDetail('header.coProposers')}:</span>
                      <span className="text-slate-900 truncate">{proposal.coProposers.map(formatAddress).join(', ')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="h-4 w-4 text-agora-muted flex-shrink-0" />
                    <span className="text-agora-muted flex-shrink-0">{tDetail('header.created')}:</span>
                    <span className="text-slate-900 whitespace-nowrap">{format(new Date(proposal.created_at), 'PPP')}</span>
                  </div>
                  {proposal.executionDate && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="h-4 w-4 text-agora-muted flex-shrink-0" />
                      <span className="text-agora-muted flex-shrink-0">{tDetail('header.executionDate')}:</span>
                      <span className="text-slate-900 whitespace-nowrap">{format(new Date(proposal.executionDate), 'PPP')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Abstract / TL;DR */}
              {proposal.content?.abstract && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-5 w-5 text-green-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.abstract')}</h3>
                  </div>
                  <p className="text-slate-900 leading-relaxed">{proposal.content.abstract.summary}</p>
                  {proposal.content.abstract.decisionPoints && proposal.content.abstract.decisionPoints.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-green-500/20">
                      <p className="text-xs text-agora-muted mb-2">{tDetail('content.decisionPoints')}</p>
                      <div className="flex flex-wrap gap-2">
                        {proposal.content.abstract.decisionPoints.map((point, i) => (
                          <span key={i} className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs">
                            {point}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Background & Problem */}
              {proposal.content?.background && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Flag className="h-5 w-5 text-orange-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.background')}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-agora-muted mb-1">{tDetail('content.currentSituation')}</p>
                      <p className="text-sm text-slate-900">{proposal.content.background.currentSituation}</p>
                    </div>
                    {proposal.content.background.limitations && (
                      <div>
                        <p className="text-xs text-agora-muted mb-1">{tDetail('content.limitations')}</p>
                        <p className="text-sm text-slate-900">{proposal.content.background.limitations}</p>
                      </div>
                    )}
                    {proposal.content.background.risks && (
                      <div className="rounded bg-red-500/10 p-2">
                        <p className="text-xs text-red-400 mb-1">{tDetail('content.risks')}</p>
                        <p className="text-sm text-red-300">{proposal.content.background.risks}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Objectives & KPIs */}
              {proposal.content?.objectives && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5 text-purple-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.objectives')}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-agora-muted mb-2">{tDetail('content.goals')}</p>
                      <ul className="space-y-1">
                        {proposal.content.objectives.goals.map((goal, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-900">
                            <CheckCircle className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                            {goal}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {proposal.content.objectives.kpis && proposal.content.objectives.kpis.length > 0 && (
                      <div>
                        <p className="text-xs text-agora-muted mb-2">{tDetail('content.kpis')}</p>
                        <div className="grid gap-2">
                          {proposal.content.objectives.kpis.map((kpi, i) => (
                            <div key={i} className="flex items-center justify-between rounded bg-agora-darker p-2">
                              <span className="text-sm text-slate-900">{kpi.metric}</span>
                              <div className="flex items-center gap-2">
                                {kpi.current && (
                                  <span className="text-xs text-agora-muted">{kpi.current} →</span>
                                )}
                                <span className="text-sm font-medium text-purple-400">{kpi.target}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Proposal Details / Execution Plan */}
              {proposal.content?.details && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="h-5 w-5 text-cyan-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.details')}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-agora-muted mb-1">{tDetail('content.executionPlan')}</p>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{proposal.content.details.executionPlan}</p>
                    </div>
                    {proposal.content.details.scope && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-agora-muted mb-2">{tDetail('content.inScope')}</p>
                          <ul className="space-y-1">
                            {proposal.content.details.scope.inScope.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-900">
                                <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0 mt-0.5" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {proposal.content.details.scope.outOfScope && (
                          <div>
                            <p className="text-xs text-agora-muted mb-2">{tDetail('content.outOfScope')}</p>
                            <ul className="space-y-1">
                              {proposal.content.details.scope.outOfScope.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-slate-900">
                                  <XCircle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {proposal.content.details.alternatives && proposal.content.details.alternatives.length > 0 && (
                      <div>
                        <p className="text-xs text-agora-muted mb-2">{tDetail('content.alternatives')}</p>
                        <div className="space-y-2">
                          {proposal.content.details.alternatives.map((alt, i) => (
                            <div key={i} className={`rounded border p-3 ${alt.recommended ? 'border-agora-primary bg-agora-primary/5' : 'border-agora-border bg-agora-darker'}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-agora-muted">{alt.option}</span>
                                <span className="font-medium text-slate-900">{alt.title}</span>
                                {alt.recommended && (
                                  <span className="px-2 py-0.5 rounded text-xs bg-agora-primary/20 text-agora-primary ml-auto">
                                    {tDetail('recommended')}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-agora-muted">{alt.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Budget */}
              {proposal.budget && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                      <h3 className="font-semibold text-slate-900">{tDetail('content.budget')}</h3>
                    </div>
                    {proposal.budget.total && (
                      <span className="text-base sm:text-lg font-bold text-yellow-400 whitespace-nowrap">
                        {proposal.budget.total.toLocaleString()} {proposal.budget.currency || 'MOC'}
                      </span>
                    )}
                  </div>
                  {proposal.budget.items && proposal.budget.items.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {proposal.budget.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-900 truncate">{item.category}</span>
                          <span className="text-agora-muted whitespace-nowrap">{item.amount.toLocaleString()} {proposal.budget?.currency || 'MOC'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {proposal.budget.paymentMethod && (
                    <div className="text-xs text-agora-muted">
                      {tDetail('content.paymentMethod')}: {tDetail(`content.payment.${proposal.budget.paymentMethod}`)}
                    </div>
                  )}
                </div>
              )}

              {/* Governance & RACI */}
              {proposal.content?.governance && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCheck className="h-5 w-5 text-indigo-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.governance')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {proposal.content.governance.decisionMaker && (
                      <div>
                        <p className="text-xs text-agora-muted">{tDetail('content.decisionMaker')}</p>
                        <p className="text-slate-900">{proposal.content.governance.decisionMaker}</p>
                      </div>
                    )}
                    {proposal.content.governance.executor && (
                      <div>
                        <p className="text-xs text-agora-muted">{tDetail('content.executor')}</p>
                        <p className="text-slate-900">{proposal.content.governance.executor}</p>
                      </div>
                    )}
                    {proposal.content.governance.accountable && (
                      <div>
                        <p className="text-xs text-agora-muted">{tDetail('content.accountable')}</p>
                        <p className="text-slate-900">{proposal.content.governance.accountable}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Related Links */}
              {proposal.relatedLinks && proposal.relatedLinks.length > 0 && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="h-5 w-5 text-blue-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('content.relatedLinks')}</h3>
                  </div>
                  <div className="space-y-2">
                    {proposal.relatedLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>{link.title}</span>
                        <span className="text-xs text-agora-muted">({link.type})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Summary (fallback if no structured content) */}
              {!proposal.content && (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                    <FileText className="h-4 w-4" />
                    <span>{tDetail('proposalContent')}</span>
                  </div>
                  <div className="text-slate-900 leading-relaxed prose prose-sm max-w-none">
                    {proposal.summary.split('\n').map((paragraph, idx) => {
                      if (paragraph.startsWith('## ')) {
                        return <h3 key={idx} className="text-lg font-semibold text-slate-900 mt-4 mb-2">{paragraph.slice(3)}</h3>;
                      }
                      if (paragraph.startsWith('### ')) {
                        return <h4 key={idx} className="text-base font-semibold text-slate-900 mt-3 mb-1">{paragraph.slice(4)}</h4>;
                      }
                      if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
                        return <li key={idx} className="text-slate-900 ml-4">{paragraph.slice(2)}</li>;
                      }
                      if (paragraph.trim() === '') {
                        return <br key={idx} />;
                      }
                      return <p key={idx} className="text-slate-900 mb-2">{paragraph}</p>;
                    })}
                  </div>
                </div>
              )}

              {/* Voting Results */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm text-agora-muted">
                    <Vote className="h-4 w-4" />
                    <span>{tDetail('votingResults')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${quorumReached ? 'text-agora-success' : 'text-agora-warning'}`}>
                      {t('quorum')}: {quorumPercent.toFixed(0)}%
                    </span>
                    {quorumReached && <CheckCircle className="h-4 w-4 text-agora-success" />}
                  </div>
                </div>

                {/* Vote Counts */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-agora-success/10 p-4 text-center">
                    <ThumbsUp className="h-6 w-6 text-agora-success mx-auto mb-2" />
                    <p className="text-2xl font-bold text-agora-success">{formatNumber(proposal.votesFor)}</p>
                    <p className="text-sm text-agora-muted">{t('for')} ({forPercent.toFixed(1)}%)</p>
                  </div>
                  <div className="rounded-lg bg-agora-error/10 p-4 text-center">
                    <ThumbsDown className="h-6 w-6 text-agora-error mx-auto mb-2" />
                    <p className="text-2xl font-bold text-agora-error">{formatNumber(proposal.votesAgainst)}</p>
                    <p className="text-sm text-agora-muted">{t('against')} ({againstPercent.toFixed(1)}%)</p>
                  </div>
                  <div className="rounded-lg bg-gray-500/10 p-4 text-center">
                    <MinusCircle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-400">{formatNumber(proposal.votesAbstain)}</p>
                    <p className="text-sm text-agora-muted">{t('abstain')} ({abstainPercent.toFixed(1)}%)</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="h-4 rounded-full bg-agora-darker overflow-hidden">
                    <div className="flex h-full">
                      <div
                        className="bg-agora-success transition-all flex items-center justify-center"
                        style={{ width: `${forPercent}%` }}
                      >
                        {forPercent > 10 && <span className="text-xs font-medium text-slate-900">{forPercent.toFixed(0)}%</span>}
                      </div>
                      <div
                        className="bg-agora-error transition-all flex items-center justify-center"
                        style={{ width: `${againstPercent}%` }}
                      >
                        {againstPercent > 10 && <span className="text-xs font-medium text-slate-900">{againstPercent.toFixed(0)}%</span>}
                      </div>
                      <div
                        className="bg-gray-500 transition-all flex items-center justify-center"
                        style={{ width: `${abstainPercent}%` }}
                      >
                        {abstainPercent > 10 && <span className="text-xs font-medium text-slate-900">{abstainPercent.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Votes & Quorum */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-agora-muted">
                    {tDetail('totalVotes')}: <span className="text-slate-900 font-medium">{formatNumber(totalVotes)}</span>
                  </span>
                  <span className="text-agora-muted">
                    {tDetail('quorumRequired')}: <span className="text-slate-900 font-medium">{formatNumber(proposal.quorum)}</span>
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                    <Calendar className="h-4 w-4" />
                    <span>{tDetail('created')}</span>
                  </div>
                  <p className="text-slate-900 font-medium">
                    {format(new Date(proposal.created_at), 'PPpp')}
                  </p>
                  <p className="text-sm text-agora-muted mt-1">
                    {formatDistanceToNow(new Date(proposal.created_at), { addSuffix: true })}
                  </p>
                </div>

                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                    <Clock className="h-4 w-4" />
                    <span>{isActive && !hasEnded ? tDetail('votingEnds') : tDetail('votingEnded')}</span>
                  </div>
                  <p className="text-slate-900 font-medium">
                    {format(endDate, 'PPpp')}
                  </p>
                  <p className={`text-sm mt-1 ${isActive && !hasEnded ? 'text-agora-warning' : 'text-agora-muted'}`}>
                    {isActive && !hasEnded
                      ? `${formatDistanceToNow(endDate)} remaining`
                      : formatDistanceToNow(endDate, { addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Token Voting Section */}
              {isActive && !hasEnded && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                    <Wallet className="h-4 w-4" />
                    <span>{tDetail('tokenVoting')}</span>
                  </div>
                  <TokenVoting proposalId={proposal.id} />
                </div>
              )}

              {/* Outcome Summary */}
              {(proposal.status === 'passed' || proposal.status === 'rejected' || proposal.status === 'executed') && (
                <div className={`rounded-lg border p-4 ${
                  proposal.status === 'rejected'
                    ? 'border-agora-error/30 bg-agora-error/5'
                    : 'border-agora-success/30 bg-agora-success/5'
                }`}>
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    <span className="font-medium text-slate-900">{tDetail('outcome')}</span>
                  </div>
                  <p className={`mt-2 text-sm ${
                    proposal.status === 'rejected' ? 'text-agora-error' : 'text-agora-success'
                  }`}>
                    {proposal.status === 'rejected'
                      ? tDetail('proposalRejected')
                      : proposal.status === 'executed'
                        ? tDetail('proposalExecuted')
                        : tDetail('proposalPassed')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-agora-muted" />
                </div>
              ) : (
                <>
                  {/* Current Status Summary */}
                  <div className={`rounded-lg border p-4 ${statusConfig[proposal.status].border} ${statusConfig[proposal.status].bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-5 w-5 ${statusConfig[proposal.status].color}`} />
                        <h3 className="font-semibold text-slate-900">{tDetail('timeline.currentStatusTitle')}</h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}>
                        {t(`status.${proposal.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-agora-muted mb-3">{tDetail(`timeline.statusDesc.${proposal.status}`)}</p>

                    {/* Vote Statistics if active or completed */}
                    {(proposal.status === 'active' || proposal.status === 'passed' || proposal.status === 'rejected') && (
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-agora-border">
                        <div className="text-center">
                          <p className="text-lg font-bold text-agora-success">{formatNumber(proposal.votesFor)}</p>
                          <p className="text-xs text-agora-muted">{t('for')}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-agora-error">{formatNumber(proposal.votesAgainst)}</p>
                          <p className="text-xs text-agora-muted">{t('against')}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-400">{formatNumber(proposal.votesAbstain)}</p>
                          <p className="text-xs text-agora-muted">{t('abstain')}</p>
                        </div>
                      </div>
                    )}

                    {/* Next Steps */}
                    {proposal.status === 'draft' && (
                      <div className="mt-3 pt-3 border-t border-agora-border">
                        <p className="text-xs text-agora-muted flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          {tDetail('timeline.nextStep.draft')}
                        </p>
                      </div>
                    )}
                    {proposal.status === 'active' && (
                      <div className="mt-3 pt-3 border-t border-agora-border">
                        <p className="text-xs text-agora-muted flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {tDetail('timeline.votingEndsAt')}: {format(new Date(proposal.endDate), 'PPpp')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Governance Process Flow */}
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch className="h-5 w-5 text-blue-400" />
                      <h3 className="font-semibold text-slate-900">{tDetail('timeline.processFlow')}</h3>
                    </div>
                    <p className="text-sm text-agora-muted mb-4">{tDetail('timeline.processFlowDesc')}</p>

                    {/* Process Steps */}
                    <div className="flex items-center justify-between gap-1 mb-4 overflow-x-auto pt-3 pb-2">
                      {['draft', 'discussion', 'voting', 'passed', 'executed'].map((step, idx) => {
                        const isCompleted = ['passed', 'rejected', 'executed'].includes(proposal.status)
                          ? idx <= ['draft', 'discussion', 'voting', 'passed', 'executed'].indexOf(
                              proposal.status === 'rejected' ? 'voting' : proposal.status
                            )
                          : proposal.status === 'active'
                            ? idx <= 2
                            : idx === 0;
                        const isCurrent = (proposal.status === 'active' && step === 'voting') ||
                                         (proposal.status === 'draft' && step === 'draft') ||
                                         (proposal.status === step);

                        return (
                          <div key={step} className="flex items-center">
                            <div className={`flex flex-col items-center min-w-[60px] ${isCurrent ? 'scale-110' : ''}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                isCompleted
                                  ? 'bg-agora-success text-slate-900'
                                  : isCurrent
                                    ? 'bg-agora-primary text-slate-900 ring-2 ring-agora-primary/50'
                                    : 'bg-agora-darker text-agora-muted'
                              }`}>
                                {isCompleted ? <CheckCircle className="h-4 w-4" /> : idx + 1}
                              </div>
                              <span className={`text-xs mt-1 ${isCurrent ? 'font-medium text-slate-900' : 'text-agora-muted'}`}>
                                {tDetail(`timeline.steps.${step}`)}
                              </span>
                            </div>
                            {idx < 4 && (
                              <div className={`w-6 h-0.5 mx-1 ${isCompleted ? 'bg-agora-success' : 'bg-agora-darker'}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Timeline Events */}
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <History className="h-5 w-5 text-purple-400" />
                      <h3 className="font-semibold text-slate-900">{tDetail('timeline.title')}</h3>
                    </div>

                    {/* Timeline */}
                    <div className="relative pl-6 border-l-2 border-agora-border space-y-6">
                      {/* Creation Event (always shown) */}
                      <div className="relative">
                        <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-blue-500 border-2 border-agora-dark" />
                        <div className="ml-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">{tDetail('timeline.created')}</span>
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                              draft
                            </span>
                          </div>
                          <p className="text-sm text-agora-muted">
                            {format(new Date(proposal.created_at), 'PPpp')}
                          </p>
                          <p className="text-xs text-agora-muted mt-1 truncate">
                            {tDetail('timeline.by')} {formatAddress(proposal.author)}
                          </p>
                          <p className="text-xs text-slate-900 mt-2 bg-agora-darker rounded p-2">
                            {tDetail('timeline.createdDesc')}
                          </p>
                        </div>
                      </div>

                      {/* History Events */}
                      {proposalHistory && proposalHistory.map((event) => {
                        const statusColors: Record<string, string> = {
                          draft: 'bg-gray-500/20 text-gray-400',
                          pending_review: 'bg-yellow-500/20 text-yellow-400',
                          discussion: 'bg-blue-500/20 text-blue-400',
                          voting: 'bg-purple-500/20 text-purple-400',
                          passed: 'bg-green-500/20 text-green-400',
                          rejected: 'bg-red-500/20 text-red-400',
                          executed: 'bg-cyan-500/20 text-cyan-400',
                          cancelled: 'bg-gray-500/20 text-gray-400',
                        };
                        const dotColors: Record<string, string> = {
                          passed: 'bg-green-500',
                          rejected: 'bg-red-500',
                          executed: 'bg-cyan-500',
                          voting: 'bg-purple-500',
                          discussion: 'bg-blue-500',
                          pending_review: 'bg-yellow-500',
                          cancelled: 'bg-gray-500',
                        };
                        const statusDescriptions: Record<string, string> = {
                          pending_review: tDetail('timeline.eventDesc.pending_review'),
                          discussion: tDetail('timeline.eventDesc.discussion'),
                          voting: tDetail('timeline.eventDesc.voting'),
                          passed: tDetail('timeline.eventDesc.passed'),
                          rejected: tDetail('timeline.eventDesc.rejected'),
                          executed: tDetail('timeline.eventDesc.executed'),
                          cancelled: tDetail('timeline.eventDesc.cancelled'),
                        };

                        return (
                          <div key={event.id} className="relative">
                            <div className={`absolute -left-[25px] w-4 h-4 rounded-full ${dotColors[event.toStatus] || 'bg-gray-500'} border-2 border-agora-dark`} />
                            <div className="ml-4">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-xs ${statusColors[event.fromStatus] || 'bg-gray-500/20 text-gray-400'}`}>
                                  {tDetail(`timeline.steps.${event.fromStatus}`) || event.fromStatus}
                                </span>
                                <ArrowRight className="h-3 w-3 text-agora-muted" />
                                <span className={`px-2 py-0.5 rounded text-xs ${statusColors[event.toStatus] || 'bg-gray-500/20 text-gray-400'}`}>
                                  {tDetail(`timeline.steps.${event.toStatus}`) || event.toStatus}
                                </span>
                              </div>
                              <p className="text-sm text-agora-muted">
                                {format(new Date(event.createdAt), 'PPpp')}
                              </p>
                              {event.reason && (
                                <p className="text-xs text-agora-muted mt-1 italic">
                                  "{event.reason}"
                                </p>
                              )}
                              {event.changedBy && (
                                <p className="text-xs text-agora-muted mt-1 truncate">
                                  {tDetail('timeline.by')} {formatAddress(event.changedBy)}
                                </p>
                              )}
                              {statusDescriptions[event.toStatus] && (
                                <p className="text-xs text-slate-900 mt-2 bg-agora-darker rounded p-2">
                                  {statusDescriptions[event.toStatus]}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Current Status Indicator (if no history) */}
                      {(!proposalHistory || proposalHistory.length === 0) && proposal.status !== 'draft' && (
                        <div className="relative">
                          <div className={`absolute -left-[25px] w-4 h-4 rounded-full ${statusConfig[proposal.status].color.replace('text-', 'bg-')} border-2 border-agora-dark`} />
                          <div className="ml-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-slate-900">{tDetail('timeline.currentStatus')}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}>
                                {t(`status.${proposal.status}`)}
                              </span>
                            </div>
                            <p className="text-sm text-agora-muted">
                              {tDetail('timeline.noHistory')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Related Issue Info - Enhanced */}
                  {proposal.issueId && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-5 w-5 text-blue-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('timeline.originIssue')}</h3>
                      </div>
                      <p className="text-sm text-agora-muted mb-3">
                        {tDetail('timeline.originIssueDesc')}
                      </p>
                      <div className="bg-agora-darker rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-agora-muted">Issue ID</span>
                          <CopyableHash hash={proposal.issueId!} truncateLength={12} className="text-slate-900" />
                        </div>
                        <button
                          onClick={() => setActiveTab('issue')}
                          className="w-full flex items-center justify-center gap-2 rounded bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/30 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {tDetail('timeline.viewIssueDetails')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decision Making Info */}
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="h-5 w-5 text-purple-400" />
                      <h3 className="font-semibold text-slate-900">{tDetail('timeline.aiAnalysisStatus')}</h3>
                    </div>
                    {decisionPacket ? (
                      <div className="space-y-2">
                        <p className="text-sm text-agora-success flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          {tDetail('timeline.aiAnalysisAvailable')}
                        </p>
                        <p className="text-xs text-agora-muted">
                          {tDetail('timeline.generatedAt')}: {format(new Date(decisionPacket.generatedAt), 'PPpp')}
                        </p>
                        <button
                          onClick={() => setActiveTab('decision')}
                          className="w-full flex items-center justify-center gap-2 rounded bg-purple-500/20 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/30 transition-colors mt-2"
                        >
                          <Brain className="h-4 w-4" />
                          {tDetail('timeline.viewAiAnalysis')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-agora-muted flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {tDetail('timeline.aiAnalysisNotYet')}
                        </p>
                        <button
                          onClick={() => setActiveTab('decision')}
                          className="w-full flex items-center justify-center gap-2 rounded bg-purple-500/20 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/30 transition-colors mt-2"
                        >
                          <Brain className="h-4 w-4" />
                          {tDetail('timeline.generateAiAnalysis')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Decision Packet Tab */}
          {activeTab === 'decision' && (
            <div className="space-y-4">
              {loadingPacket ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-agora-muted" />
                </div>
              ) : decisionPacket ? (
                <>
                  {/* Summary */}
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="h-5 w-5 text-purple-400" />
                      <h3 className="font-semibold text-slate-900">{tDetail('aiSummary')}</h3>
                    </div>
                    <p className="text-slate-900 leading-relaxed">{decisionPacket.summary}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-agora-muted">
                      <span>v{decisionPacket.version}</span>
                      <span>{format(new Date(decisionPacket.generatedAt), 'PPpp')}</span>
                      {decisionPacket.modelUsed && <span>{decisionPacket.modelUsed}</span>}
                    </div>
                  </div>

                  {/* Risk Assessment */}
                  {decisionPacket.content?.riskAssessment && (
                    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-5 w-5 text-orange-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('riskAssessment')}</h3>
                        <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                          decisionPacket.content.riskAssessment.level === 'low' ? 'bg-green-500/20 text-green-400' :
                          decisionPacket.content.riskAssessment.level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          decisionPacket.content.riskAssessment.level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {decisionPacket.content.riskAssessment.level.toUpperCase()}
                        </span>
                      </div>
                      {decisionPacket.content.riskAssessment.factors?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-agora-muted mb-2">{tDetail('riskFactors')}</p>
                          <ul className="space-y-1">
                            {decisionPacket.content.riskAssessment.factors.map((factor, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-900">
                                <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                {factor}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {decisionPacket.content.riskAssessment.mitigations?.length > 0 && (
                        <div>
                          <p className="text-xs text-agora-muted mb-2">{tDetail('mitigations')}</p>
                          <ul className="space-y-1">
                            {decisionPacket.content.riskAssessment.mitigations.map((mitigation, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-900">
                                <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                                {mitigation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Options */}
                  {decisionPacket.content?.options?.length > 0 && (
                    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="h-5 w-5 text-yellow-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('options')}</h3>
                      </div>
                      <div className="space-y-3">
                        {decisionPacket.content.options.map((option, i) => (
                          <div key={i} className={`rounded-lg border p-3 ${
                            option.recommendation ? 'border-agora-primary bg-agora-primary/5' : 'border-agora-border bg-agora-darker'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-slate-900">{option.title}</span>
                              {option.recommendation && (
                                <span className="px-2 py-0.5 rounded text-xs bg-agora-primary/20 text-agora-primary">
                                  {tDetail('recommended')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-agora-muted mb-2">{option.description}</p>
                            {option.pros?.length > 0 && (
                              <div className="text-xs">
                                <span className="text-green-400">+</span>
                                <span className="text-agora-muted ml-1">{option.pros.join(', ')}</span>
                              </div>
                            )}
                            {option.cons?.length > 0 && (
                              <div className="text-xs">
                                <span className="text-red-400">-</span>
                                <span className="text-agora-muted ml-1">{option.cons.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stakeholder Impact */}
                  {decisionPacket.content?.stakeholderImpact?.length > 0 && (
                    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="h-5 w-5 text-blue-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('stakeholderImpact')}</h3>
                      </div>
                      <div className="space-y-2">
                        {decisionPacket.content.stakeholderImpact.map((impact, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg bg-agora-darker p-3">
                            <span className={`w-2 h-2 rounded-full ${
                              impact.sentiment === 'positive' ? 'bg-green-400' :
                              impact.sentiment === 'negative' ? 'bg-red-400' :
                              'bg-gray-400'
                            }`} />
                            <span className="font-medium text-slate-900">{impact.group}</span>
                            <span className="text-sm text-agora-muted flex-1">{impact.impact}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Recommendation */}
                  {decisionPacket.content?.recommendation && (
                    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="h-5 w-5 text-purple-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('aiRecommendation')}</h3>
                        <span className="ml-auto text-xs text-agora-muted">
                          {tDetail('confidence')}: {(decisionPacket.content.recommendation.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-slate-900 font-medium mb-2">
                        {decisionPacket.content.recommendation.choice}
                      </p>
                      <p className="text-sm text-agora-muted">
                        {decisionPacket.content.recommendation.rationale}
                      </p>
                    </div>
                  )}

                  {/* Agent Contributions */}
                  {(decisionPacket.content?.agentContributions?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="h-5 w-5 text-cyan-400" />
                        <h3 className="font-semibold text-slate-900">{tDetail('agentPerspectives')}</h3>
                      </div>
                      <div className="space-y-3">
                        {decisionPacket.content?.agentContributions?.map((contrib, i) => (
                          <div key={i} className="rounded-lg bg-agora-darker p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-slate-900">{contrib.agentName}</span>
                              {contrib.vote && (
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  contrib.vote === 'for' ? 'bg-green-500/20 text-green-400' :
                                  contrib.vote === 'against' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {t(contrib.vote)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-agora-muted">{contrib.perspective}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-agora-muted">
                  <Brain className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{tDetail('noDecisionPacket')}</p>
                  <p className="text-sm mt-1 mb-4">{tDetail('noDecisionPacketDesc')}</p>
                  <button
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {tDetail('generatingAnalysis')}
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4" />
                        {tDetail('generateAnalysis')}
                      </>
                    )}
                  </button>
                  {generateMutation.isError && (
                    <p className="text-sm text-red-400 mt-2">{tDetail('generateError')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Votes Tab */}
          {activeTab === 'votes' && (
            <div className="space-y-4">
              {loadingVotes ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-agora-muted" />
                </div>
              ) : voteHistory && voteHistory.length > 0 ? (
                <>
                  {/* Vote Summary */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg bg-agora-card p-3 text-center">
                      <p className="text-2xl font-bold text-slate-900">{voteHistory.length}</p>
                      <p className="text-xs text-agora-muted">{tDetail('totalVoters')}</p>
                    </div>
                    <div className="rounded-lg bg-green-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-green-400">
                        {voteHistory.filter(v => v.choice === 'for').length}
                      </p>
                      <p className="text-xs text-agora-muted">{t('for')}</p>
                    </div>
                    <div className="rounded-lg bg-red-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-red-400">
                        {voteHistory.filter(v => v.choice === 'against').length}
                      </p>
                      <p className="text-xs text-agora-muted">{t('against')}</p>
                    </div>
                    <div className="rounded-lg bg-gray-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-gray-400">
                        {voteHistory.filter(v => v.choice === 'abstain').length}
                      </p>
                      <p className="text-xs text-agora-muted">{t('abstain')}</p>
                    </div>
                  </div>

                  {/* Vote List */}
                  <div className="rounded-lg border border-agora-border bg-agora-card">
                    <div className="p-3 border-b border-agora-border">
                      <h3 className="font-medium text-slate-900">{tDetail('recentVotes')}</h3>
                    </div>
                    <div className="divide-y divide-agora-border max-h-80 overflow-y-auto">
                      {voteHistory.map((vote) => (
                        <div key={vote.id} className="p-3 hover:bg-agora-darker/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-full p-1.5 ${
                              vote.choice === 'for' ? 'bg-green-500/20' :
                              vote.choice === 'against' ? 'bg-red-500/20' :
                              'bg-gray-500/20'
                            }`}>
                              {vote.choice === 'for' && <ThumbsUp className="h-4 w-4 text-green-400" />}
                              {vote.choice === 'against' && <ThumbsDown className="h-4 w-4 text-red-400" />}
                              {vote.choice === 'abstain' && <MinusCircle className="h-4 w-4 text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-slate-900">
                                  {formatAddress(vote.voter)}
                                </span>
                                {vote.voterType === 'agent' && (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                                    Agent
                                  </span>
                                )}
                                <span className="text-xs text-agora-muted ml-auto">
                                  {formatNumber(vote.weight)} VP
                                </span>
                              </div>
                              {vote.reason && (
                                <p className="text-sm text-agora-muted mt-1 truncate">
                                  "{vote.reason}"
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-agora-muted">
                              {formatDistanceToNow(new Date(vote.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-agora-muted">
                  <History className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{tDetail('noVotes')}</p>
                  <p className="text-sm mt-1">{tDetail('noVotesDesc')}</p>
                </div>
              )}
            </div>
          )}

          {/* Issue Tab */}
          {activeTab === 'issue' && proposal.issueId && (
            <div className="space-y-4">
              {loadingIssue ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-agora-muted" />
                </div>
              ) : relatedIssue ? (
                <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ExternalLink className="h-5 w-5 text-blue-400" />
                    <h3 className="font-semibold text-slate-900">{tDetail('relatedIssue')}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-agora-muted">{tDetail('issueId')}</span>
                      <p className="font-mono text-sm text-slate-900">{relatedIssue.id}</p>
                    </div>
                    <div>
                      <span className="text-xs text-agora-muted">{tDetail('issueTitle')}</span>
                      <p className="text-slate-900 font-medium">{relatedIssue.title}</p>
                    </div>
                    <div>
                      <span className="text-xs text-agora-muted">{tDetail('issueDescription')}</span>
                      <p className="text-sm text-agora-muted whitespace-pre-wrap">{relatedIssue.description}</p>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-agora-muted">{tDetail('status')}: </span>
                        <span className="text-slate-900">{relatedIssue.status}</span>
                      </div>
                      <div>
                        <span className="text-agora-muted">{tDetail('priority')}: </span>
                        <span className="text-slate-900">{relatedIssue.priority}</span>
                      </div>
                      <div>
                        <span className="text-agora-muted">Category: </span>
                        <span className="text-slate-900">{relatedIssue.category}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-agora-muted">
                  <ExternalLink className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{tDetail('issueNotFound')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-agora-border p-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-agora-muted truncate">
            <CopyableHash hash={proposal.id} truncateLength={8} />
            {proposal.issueId && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Issue #<CopyableHash hash={proposal.issueId} truncateLength={8} />
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center justify-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border">
              <Share2 className="h-4 w-4 flex-shrink-0" />
              {tDetail('share')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
