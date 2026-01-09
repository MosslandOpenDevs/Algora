'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Radio,
  Rss,
  Github,
  Link2,
  Database,
  Filter,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

import { fetchSignals, type Signal, type SignalsResponse } from '@/lib/api';
import { SignalCard } from '@/components/signals/SignalCard';
import { SignalDetailModal } from '@/components/signals/SignalDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

const SOURCES = ['all', 'rss', 'github', 'blockchain', 'api', 'manual'] as const;

const sourceIcons: Record<string, React.ReactNode> = {
  rss: <Rss className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  blockchain: <Database className="h-4 w-4" />,
  api: <Link2 className="h-4 w-4" />,
  manual: <Radio className="h-4 w-4" />,
};

// Helper to extract source type from source string (e.g., "rss:Cointelegraph" -> "rss")
function getSourceType(source: string): string {
  const type = source.split(':')[0].toLowerCase();
  if (['rss', 'github', 'blockchain', 'api', 'manual'].includes(type)) {
    return type;
  }
  return 'api';
}

export default function SignalsPage() {
  const t = useTranslations('Signals');
  const tGuide = useTranslations('Guide.tooltips');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [showProcessed, setShowProcessed] = useState<'all' | 'processed' | 'unprocessed'>('all');
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  const { data, isLoading, refetch } = useQuery<SignalsResponse>({
    queryKey: ['signals', selectedSource],
    queryFn: () => fetchSignals(100, selectedSource),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const signals = data?.signals;
  const totalSignals = data?.total || 0;

  const filteredSignals = signals?.filter((signal) => {
    const sourceType = getSourceType(signal.source);
    const matchesSource = selectedSource === 'all' || sourceType === selectedSource;
    const matchesSeverity =
      showProcessed === 'all' ||
      (showProcessed === 'processed' && signal.severity === 'low') ||
      (showProcessed === 'unprocessed' && signal.severity !== 'low');
    return matchesSource && matchesSeverity;
  });

  const stats = {
    showing: signals?.length || 0,
    total: totalSignals,
    processed: signals?.filter((s) => s.severity === 'low').length || 0,
    unprocessed: signals?.filter((s) => s.severity !== 'low').length || 0,
    highPriority: signals?.filter((s) => s.severity === 'high' || s.severity === 'critical').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('signals')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-slate-900 transition-colors hover:bg-agora-border"
        >
          <RefreshCw className="h-4 w-4" />
          {t('refresh')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30"
          style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 text-agora-muted">
            <Radio className="h-4 w-4" />
            <span className="text-sm">{t('stats.total')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
          {stats.showing < stats.total && (
            <p className="mt-1 text-xs text-agora-muted">
              Showing {stats.showing} of {stats.total.toLocaleString()}
            </p>
          )}
        </div>
        <div
          className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-success/30"
          style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.processed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.processed}</p>
        </div>
        <div
          className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-warning/30"
          style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 text-agora-warning">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{t('stats.pending')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.unprocessed}</p>
        </div>
        <div
          className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-error/30"
          style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
        >
          <div className="flex items-center gap-2 text-agora-error">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.highPriority')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.highPriority}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Source Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-agora-muted" />
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((source) => (
              <button
                key={source}
                onClick={() => setSelectedSource(source)}
                className={`
                  flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                  transition-all duration-200
                  ${selectedSource === source
                    ? 'bg-agora-primary text-slate-900 scale-105 shadow-lg shadow-agora-primary/30'
                    : 'bg-agora-card text-agora-muted hover:bg-agora-border hover:scale-105'
                  }
                `}
              >
                {source !== 'all' && sourceIcons[source]}
                <span>{t(`sources.${source}`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'processed', 'unprocessed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setShowProcessed(status)}
              className={`
                rounded-full px-3 py-1.5 text-xs font-medium
                transition-all duration-200
                ${showProcessed === status
                  ? 'bg-agora-accent text-slate-900 scale-105 shadow-lg shadow-agora-accent/30'
                  : 'bg-agora-card text-agora-muted hover:bg-agora-border hover:scale-105'
                }
              `}
            >
              {t(`filter.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Signal List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-agora-border bg-agora-card"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      ) : filteredSignals?.length === 0 ? (
        <div className="animate-fade-in flex flex-col items-center justify-center rounded-lg border border-dashed border-agora-border p-12 text-center">
          <div className="mb-4 rounded-full bg-agora-card p-4">
            <Radio className="h-12 w-12 text-agora-muted" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{t('noSignals')}</h3>
          <p className="mt-2 text-sm text-agora-muted max-w-md">{t('noSignalsDesc')}</p>
          {(selectedSource !== 'all' || showProcessed !== 'all') && (
            <button
              onClick={() => {
                setSelectedSource('all');
                setShowProcessed('all');
              }}
              className="mt-4 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSignals?.map((signal, index) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              index={index}
              onClick={() => setSelectedSignal(signal)}
            />
          ))}
        </div>
      )}

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </div>
  );
}
