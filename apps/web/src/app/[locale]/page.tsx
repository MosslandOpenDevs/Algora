'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Activity, Users, MessageSquare, AlertTriangle } from 'lucide-react';

import { fetchStats, type Activity as ActivityType, type Agent } from '@/lib/api';
import { StatsCard } from '@/components/ui/StatsCard';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { ActivityDetailModal } from '@/components/ui/ActivityDetailModal';
import { StatsDetailModal, type StatInfo } from '@/components/ui/StatsDetailModal';
import { AgentLobbyPreview } from '@/components/agents/AgentLobbyPreview';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatInfo | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  // Stats configuration for modals
  const statsConfig: StatInfo[] = [
    {
      key: 'activeAgents',
      title: t('stats.activeAgents'),
      value: stats?.activeAgents ?? 0,
      icon: <Users className="h-5 w-5 text-blue-400" />,
      trend: stats?.agentsTrend,
      description: t('stats.activeAgentsDesc'),
      relatedActivityTypes: ['AGENT_SUMMONED', 'AGENT_CHATTER', 'AGENT_SPEAKING'],
    },
    {
      key: 'activeSessions',
      title: t('stats.activeSessions'),
      value: stats?.activeSessions ?? 0,
      icon: <MessageSquare className="h-5 w-5 text-purple-400" />,
      trend: stats?.sessionsTrend,
      description: t('stats.activeSessionsDesc'),
      relatedActivityTypes: ['AGORA_SESSION_START', 'AGORA_SESSION_AUTO_CREATED'],
    },
    {
      key: 'signalsToday',
      title: t('stats.signalsToday'),
      value: stats?.signalsToday ?? 0,
      icon: <Activity className="h-5 w-5 text-green-400" />,
      trend: stats?.signalsTrend,
      description: t('stats.signalsTodayDesc'),
      relatedActivityTypes: ['COLLECTOR'],
    },
    {
      key: 'openIssues',
      title: t('stats.openIssues'),
      value: stats?.openIssues ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-orange-400" />,
      description: t('stats.openIssuesDesc'),
      relatedActivityTypes: ['ISSUE_DETECTED'],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <HelpTooltip content={tGuide('dashboard')} />
        </div>
        <p className="text-agora-muted">{t('subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={statsConfig[0].title}
          value={statsConfig[0].value}
          icon={statsConfig[0].icon}
          trend={statsConfig[0].trend}
          variant="primary"
          subtitle={t('stats.clickForDetails')}
          onClick={() => setSelectedStat(statsConfig[0])}
        />
        <StatsCard
          title={statsConfig[1].title}
          value={statsConfig[1].value}
          icon={statsConfig[1].icon}
          trend={statsConfig[1].trend}
          subtitle={t('stats.clickForDetails')}
          onClick={() => setSelectedStat(statsConfig[1])}
        />
        <StatsCard
          title={statsConfig[2].title}
          value={statsConfig[2].value}
          icon={statsConfig[2].icon}
          trend={statsConfig[2].trend}
          variant="success"
          subtitle={t('stats.clickForDetails')}
          onClick={() => setSelectedStat(statsConfig[2])}
        />
        <StatsCard
          title={statsConfig[3].title}
          value={statsConfig[3].value}
          icon={statsConfig[3].icon}
          variant={(stats?.openIssues ?? 0) > 5 ? 'warning' : 'default'}
          subtitle={t('stats.clickForDetails')}
          onClick={() => setSelectedStat(statsConfig[3])}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activity Feed */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-agora-border bg-agora-card p-4">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t('activityFeed')}
            </h2>
            <div className="max-h-[500px] overflow-y-auto">
              <ActivityFeed onActivityClick={setSelectedActivity} />
            </div>
          </div>
        </div>

        {/* Agent Lobby Preview */}
        <div>
          <div className="rounded-lg border border-agora-border bg-agora-card p-4">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t('agentLobby')}
            </h2>
            <AgentLobbyPreview onAgentClick={setSelectedAgent} />
          </div>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Stats Detail Modal */}
      {selectedStat && (
        <StatsDetailModal
          stat={selectedStat}
          onClose={() => setSelectedStat(null)}
        />
      )}
    </div>
  );
}
