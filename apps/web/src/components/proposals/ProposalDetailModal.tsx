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
} from 'lucide-react';
import { TokenVoting } from './TokenVoting';
import {
  fetchDecisionPacket,
  fetchProposalVoteHistory,
  fetchIssue,
} from '@/lib/api';

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

interface ProposalDetailModalProps {
  proposal: Proposal;
  onClose: () => void;
}

type TabType = 'overview' | 'decision' | 'votes' | 'issue';

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

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const tabs = [
    { id: 'overview' as TabType, label: tDetail('tabs.overview'), icon: FileText },
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
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-agora-border p-6">
          <div className="flex items-start gap-4">
            <div className={`rounded-lg border p-3 ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].border}`}>
              <StatusIcon className={`h-5 w-5 ${statusConfig[proposal.status].color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-agora-muted">{proposal.id.slice(0, 8)}...</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[proposal.status].bg} ${statusConfig[proposal.status].color}`}
                >
                  {t(`status.${proposal.status}`)}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 pr-8">{proposal.title}</h2>
              <div className="mt-2 flex items-center gap-3 text-sm text-agora-muted">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {proposal.author}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(proposal.created_at), 'PPP')}
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
        <div className="flex border-b border-agora-border bg-agora-darker/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-agora-primary text-agora-primary'
                  : 'border-transparent text-agora-muted hover:text-slate-900'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <FileText className="h-4 w-4" />
                  <span>{tDetail('summary')}</span>
                </div>
                <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                  {proposal.summary}
                </p>
              </div>

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
                  <p className="text-sm mt-1">{tDetail('noDecisionPacketDesc')}</p>
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
        <div className="flex items-center justify-between border-t border-agora-border p-4">
          <div className="flex items-center gap-2 text-sm text-agora-muted">
            <span>{proposal.id.slice(0, 8)}...</span>
            {proposal.issueId && (
              <>
                <span>•</span>
                <span>Issue #{proposal.issueId.slice(0, 8)}...</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border">
              <Share2 className="h-4 w-4" />
              {tDetail('share')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
