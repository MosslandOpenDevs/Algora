'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Clock,
  Filter,
  Radio,
  AlertTriangle,
  FileText,
  Vote,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { GovernanceTimeline } from '@/components/timeline/GovernanceTimeline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

type EventType = 'all' | 'signal' | 'issue' | 'proposal' | 'vote';

const eventTypeOptions: { value: EventType; label: string; icon: typeof Radio }[] = [
  { value: 'all', label: 'All Events', icon: Clock },
  { value: 'signal', label: 'Signals', icon: Radio },
  { value: 'issue', label: 'Issues', icon: AlertTriangle },
  { value: 'proposal', label: 'Proposals', icon: FileText },
  { value: 'vote', label: 'Votes', icon: Vote },
];

export default function TimelinePage() {
  const t = useTranslations('Timeline');
  const searchParams = useSearchParams();
  const issueId = searchParams.get('issueId');
  const proposalId = searchParams.get('proposalId');

  const [selectedType, setSelectedType] = useState<EventType>('all');
  const [limit, setLimit] = useState(50);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['timeline-stats'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/timeline/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('title')}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('subtitle')}
              </p>
            </div>

            {/* Quick stats */}
            {stats && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 dark:bg-blue-900/20">
                  <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {stats.today.signals} {t('todaySignals')}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {stats.today.issues} {t('todayIssues')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Filters */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="h-5 w-5 text-gray-400" />
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {t('filters')}
                </h3>
              </div>

              {/* Event type filter */}
              <div className="space-y-2">
                {eventTypeOptions.map(option => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setSelectedType(option.value)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedType === option.value
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* Limit selector */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('showCount')}
                </label>
                <select
                  value={limit}
                  onChange={e => setLimit(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Recent flows */}
            {stats?.recentFlow && stats.recentFlow.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                  {t('recentFlows')}
                </h3>
                <div className="space-y-3">
                  {stats.recentFlow.slice(0, 5).map((flow: {
                    issueId: string;
                    issueTitle: string;
                    signalCount: number;
                    proposalCount: number;
                    voteCount: number;
                    status: string;
                  }) => (
                    <a
                      key={flow.issueId}
                      href={`/timeline?issueId=${flow.issueId}`}
                      className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                        {flow.issueTitle}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Radio className="h-3 w-3" />
                          {flow.signalCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {flow.proposalCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Vote className="h-3 w-3" />
                          {flow.voteCount}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 ${
                          flow.status === 'resolved'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                        }`}>
                          {flow.status}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly summary */}
            {stats && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {t('weekSummary')}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                      {stats.week.signals}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">{t('signals')}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                      {stats.week.issues}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t('issues')}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/20">
                    <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                      {stats.week.proposals}
                    </p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">{t('proposals')}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 p-3 dark:bg-cyan-900/20">
                    <p className="text-xl font-bold text-cyan-700 dark:text-cyan-300">
                      {stats.week.votes}
                    </p>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400">{t('votes')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main timeline */}
          <div className="lg:col-span-3">
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <GovernanceTimeline
                issueId={issueId || undefined}
                proposalId={proposalId || undefined}
                limit={limit}
                showStats={!issueId && !proposalId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
