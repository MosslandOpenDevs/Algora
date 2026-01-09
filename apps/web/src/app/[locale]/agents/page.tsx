'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Users,
  Lightbulb,
  Wrench,
  TrendingUp,
  Shield,
  Zap,
  Scale,
  Brain,
  UserX,
} from 'lucide-react';

import { fetchAgents, type Agent } from '@/lib/api';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

const CLUSTERS = [
  'visionaries',
  'builders',
  'investors',
  'guardians',
  'operatives',
  'moderators',
  'advisors',
] as const;

const clusterConfig: Record<string, { icon: typeof Users; color: string; bg: string; border: string }> = {
  visionaries: { icon: Lightbulb, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  builders: { icon: Wrench, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  investors: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  guardians: { icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  operatives: { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  moderators: { icon: Scale, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30' },
  advisors: { icon: Brain, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
};

export default function AgentsPage() {
  const t = useTranslations('Agents');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  });

  const filteredAgents = agents?.filter((agent: Agent) => {
    const matchesCluster = !selectedCluster || agent.group_name === selectedCluster;
    const matchesSearch =
      !searchQuery ||
      agent.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  const agentsByCluster = CLUSTERS.reduce(
    (acc, cluster) => {
      acc[cluster] = filteredAgents?.filter((a: Agent) => a.group_name === cluster) || [];
      return acc;
    },
    {} as Record<string, Agent[]>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('agents')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-agora-muted" />
          <span className="text-agora-muted">
            {filteredAgents?.length || 0} / {agents?.length || 0} agents
          </span>
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

        {/* Cluster Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-agora-muted" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCluster(null)}
              className={`
                rounded-full px-3 py-1.5 text-xs font-medium
                transition-all duration-200
                ${!selectedCluster
                  ? 'bg-agora-primary text-slate-900 scale-105 shadow-lg shadow-agora-primary/30'
                  : 'bg-agora-card text-agora-muted hover:bg-agora-border hover:scale-105'
                }
              `}
            >
              {t('allClusters')}
            </button>
            {CLUSTERS.map((cluster) => {
              const config = clusterConfig[cluster];
              const ClusterIcon = config.icon;
              const isActive = selectedCluster === cluster;
              return (
                <button
                  key={cluster}
                  onClick={() => setSelectedCluster(cluster === selectedCluster ? null : cluster)}
                  className={`
                    inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                    transition-all duration-200
                    ${isActive
                      ? `${config.bg} ${config.color} border ${config.border} scale-105 shadow-lg`
                      : 'bg-agora-card text-agora-muted hover:bg-agora-border hover:scale-105'
                    }
                  `}
                >
                  <ClusterIcon className="h-3 w-3" />
                  {t(`groups.${cluster}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-agora-border bg-agora-card"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      ) : filteredAgents?.length === 0 ? (
        // Empty state
        <div className="animate-fade-in flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-agora-card p-4">
            <UserX className="h-12 w-12 text-agora-muted" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{t('noResults')}</h3>
          <p className="mt-2 text-sm text-agora-muted max-w-md">
            {searchQuery
              ? t('noSearchResults', { query: searchQuery })
              : t('noAgentsInCluster')}
          </p>
          {(searchQuery || selectedCluster) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCluster(null);
              }}
              className="mt-4 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : selectedCluster ? (
        // Single cluster view
        <div className="animate-fade-in grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAgents?.map((agent: Agent, index: number) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={index}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      ) : (
        // All clusters view
        <div className="space-y-8">
          {CLUSTERS.map((cluster, clusterIndex) => {
            const clusterAgents = agentsByCluster[cluster];
            if (!clusterAgents?.length) return null;

            const config = clusterConfig[cluster];
            const ClusterIcon = config.icon;

            return (
              <div
                key={cluster}
                className="animate-slide-up"
                style={{
                  animationDelay: `${clusterIndex * 100}ms`,
                  animationFillMode: 'backwards',
                }}
              >
                <h2 className="mb-4 flex items-center gap-3">
                  <span
                    className={`
                      flex h-8 w-8 items-center justify-center rounded-lg
                      ${config.bg} ${config.color} border ${config.border}
                    `}
                  >
                    <ClusterIcon className="h-4 w-4" />
                  </span>
                  <span className="text-lg font-semibold text-slate-900">
                    {t(`groups.${cluster}`)}
                  </span>
                  <span className={`text-sm font-normal ${config.color}`}>
                    ({clusterAgents.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {clusterAgents.map((agent: Agent, index: number) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      index={index}
                      onClick={() => setSelectedAgent(agent)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
