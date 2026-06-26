'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Activity, Users, MessageSquare, AlertTriangle } from 'lucide-react';

import { fetchStats, type Activity as ActivityType, type Agent, type Stats } from '@/lib/api';
import { StatsCard } from '@/components/ui/StatsCard';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { ActivityDetailModal } from '@/components/ui/ActivityDetailModal';
import { StatsDetailModal, type StatInfo } from '@/components/ui/StatsDetailModal';
import { AgentLobbyPreview } from '@/components/agents/AgentLobbyPreview';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DashboardClientProps {
  initialStats: Stats;
  initialAgents: Agent[];
  initialActivities: ActivityType[];
}

export function DashboardClient({
  initialStats,
  initialAgents,
  initialActivities,
}: DashboardClientProps) {
  const t = useTranslations('Dashboard');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatInfo | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    initialData: initialStats,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const statsConfig: StatInfo[] = [
    {
      key: 'activeAgents',
      title: t('stats.activeAgents'),
      value: stats?.activeAgents ?? 0,
      icon: <Users className="h-5 w-5 text-blue-700 dark:text-blue-400" />,
      trend: stats?.agentsTrend,
      description: t('stats.activeAgentsDesc'),
      relatedActivityTypes: ['AGENT_SUMMONED', 'AGENT_CHATTER', 'AGENT_SPEAKING'],
    },
    {
      key: 'activeSessions',
      title: t('stats.activeSessions'),
      value: stats?.activeSessions ?? 0,
      icon: <MessageSquare className="h-5 w-5 text-purple-700 dark:text-purple-400" />,
      trend: stats?.sessionsTrend,
      description: t('stats.activeSessionsDesc'),
      relatedActivityTypes: ['AGORA_SESSION_START', 'AGORA_SESSION_AUTO_CREATED'],
    },
    {
      key: 'signalsToday',
      title: t('stats.signalsToday'),
      value: stats?.signalsToday ?? 0,
      icon: <Activity className="h-5 w-5 text-green-700 dark:text-green-400" />,
      trend: stats?.signalsTrend,
      description: t('stats.signalsTodayDesc'),
      relatedActivityTypes: ['COLLECTOR'],
    },
    {
      key: 'openIssues',
      title: t('stats.openIssues'),
      value: stats?.openIssues ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-orange-700 dark:text-orange-400" />,
      description: t('stats.openIssuesDesc'),
      relatedActivityTypes: ['ISSUE_DETECTED'],
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          <HelpTooltip content={tGuide('dashboard')} />
        </div>
        <p className="text-sm md:text-base text-agora-muted dark:text-agora-dark-muted">{t('subtitle')}</p>
      </div>

      {/* Stats Grid - 2x2 on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
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
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        {/* Activity Feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">{t('activityFeed')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] md:h-[500px]">
                <ActivityFeed
                  initialData={initialActivities}
                  onActivityClick={setSelectedActivity}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Agent Lobby Preview */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">{t('agentLobby')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AgentLobbyPreview
                initialData={initialAgents}
                onAgentClick={setSelectedAgent}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
      {selectedStat && (
        <StatsDetailModal
          stat={selectedStat}
          onClose={() => setSelectedStat(null)}
        />
      )}
    </div>
  );
}
