'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Filter,
  Plus,
  Search,
  CheckCircle,
  PlayCircle,
  Eye,
} from 'lucide-react';

import { fetchIssues, type Issue } from '@/lib/api';
import { IssueCard } from '@/components/issues/IssueCard';
import { IssueDetailModal } from '@/components/issues/IssueDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

const STATUSES = ['all', 'detected', 'confirmed', 'in_progress', 'resolved', 'dismissed'] as const;
const PRIORITIES = ['all', 'critical', 'high', 'medium', 'low'] as const;

export default function IssuesPage() {
  const t = useTranslations('Issues');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const { data: issues, isLoading } = useQuery({
    queryKey: ['issues'],
    queryFn: () => fetchIssues(100),
    refetchInterval: 10000,
  });

  const filteredIssues = issues?.filter((issue) => {
    const matchesStatus = selectedStatus === 'all' || issue.status === selectedStatus;
    const matchesPriority = selectedPriority === 'all' || issue.priority === selectedPriority;
    const matchesSearch =
      !searchQuery ||
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const stats = {
    detected: issues?.filter((i) => i.status === 'detected').length || 0,
    confirmed: issues?.filter((i) => i.status === 'confirmed').length || 0,
    in_progress: issues?.filter((i) => i.status === 'in_progress').length || 0,
    resolved: issues?.filter((i) => i.status === 'resolved').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            <HelpTooltip content={tGuide('issues')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-white transition-colors hover:bg-agora-primary/80">
          <Plus className="h-4 w-4" />
          {t('createIssue')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-warning">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.detected')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.detected}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-accent">
            <Eye className="h-4 w-4" />
            <span className="text-sm">{t('stats.confirmed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.confirmed}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-primary">
            <PlayCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.in_progress')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.in_progress}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.resolved')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.resolved}</p>
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

      {/* Priority Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-agora-muted">{t('priority.label')}:</span>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((priority) => (
            <button
              key={priority}
              onClick={() => setSelectedPriority(priority)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedPriority === priority
                  ? 'bg-agora-accent text-white'
                  : 'bg-agora-card text-agora-muted hover:bg-agora-border'
              }`}
            >
              {t(`priority.${priority}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Issue List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border border-agora-border bg-agora-card"
            />
          ))}
        </div>
      ) : filteredIssues?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-agora-border p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-agora-muted/50" />
          <h3 className="mt-4 text-lg font-semibold text-white">{t('noIssues')}</h3>
          <p className="mt-2 text-sm text-agora-muted">{t('noIssuesDesc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIssues?.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onClick={() => setSelectedIssue(issue)}
            />
          ))}
        </div>
      )}

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}
