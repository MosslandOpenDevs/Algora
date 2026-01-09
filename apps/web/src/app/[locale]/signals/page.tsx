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

import { SignalCard } from '@/components/signals/SignalCard';

interface Signal {
  id: string;
  source: 'rss' | 'github' | 'blockchain' | 'api' | 'manual';
  title: string;
  content: string;
  url?: string;
  processed: boolean;
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  metadata?: Record<string, unknown>;
}

const SOURCES = ['all', 'rss', 'github', 'blockchain', 'api', 'manual'] as const;

const sourceIcons: Record<string, React.ReactNode> = {
  rss: <Rss className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  blockchain: <Database className="h-4 w-4" />,
  api: <Link2 className="h-4 w-4" />,
  manual: <Radio className="h-4 w-4" />,
};

// Mock data for demo
const mockSignals: Signal[] = [
  {
    id: '1',
    source: 'rss',
    title: 'Ethereum Gas Fees Spike to 6-Month High',
    content: 'Network congestion leads to increased transaction costs across major DEXs.',
    url: 'https://example.com/news/1',
    processed: true,
    priority: 'high',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    source: 'github',
    title: 'Critical Security Update: v2.5.1 Released',
    content: 'Patches vulnerability in token approval mechanism. Immediate update recommended.',
    url: 'https://github.com/example/repo/releases/v2.5.1',
    processed: true,
    priority: 'high',
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '3',
    source: 'blockchain',
    title: 'Large Token Transfer Detected',
    content: 'Wallet 0x1234...5678 moved 1,000,000 MOC to exchange. Potential sell pressure.',
    processed: false,
    priority: 'medium',
    created_at: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: '4',
    source: 'api',
    title: 'Community Sentiment Analysis',
    content: 'Weekly sentiment score: 72/100 (Bullish). Key topics: staking rewards, governance proposal.',
    processed: true,
    priority: 'low',
    created_at: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: '5',
    source: 'rss',
    title: 'DeFi Protocol Announces Partnership',
    content: 'Major integration planned for Q2 2026, expected to bring 500k new users.',
    url: 'https://example.com/news/5',
    processed: false,
    priority: 'medium',
    created_at: new Date(Date.now() - 18000000).toISOString(),
  },
  {
    id: '6',
    source: 'manual',
    title: 'Team Meeting Notes: Product Roadmap',
    content: 'Key decisions made regarding feature prioritization for next sprint.',
    processed: true,
    priority: 'low',
    created_at: new Date(Date.now() - 21600000).toISOString(),
  },
];

export default function SignalsPage() {
  const t = useTranslations('Signals');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [showProcessed, setShowProcessed] = useState<'all' | 'processed' | 'unprocessed'>('all');

  // In real app, this would fetch from API
  const { data: signals, isLoading, refetch } = useQuery({
    queryKey: ['signals', selectedSource, showProcessed],
    queryFn: async () => {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return mockSignals;
    },
  });

  const filteredSignals = signals?.filter((signal) => {
    const matchesSource = selectedSource === 'all' || signal.source === selectedSource;
    const matchesProcessed =
      showProcessed === 'all' ||
      (showProcessed === 'processed' && signal.processed) ||
      (showProcessed === 'unprocessed' && !signal.processed);
    return matchesSource && matchesProcessed;
  });

  const stats = {
    total: signals?.length || 0,
    processed: signals?.filter((s) => s.processed).length || 0,
    unprocessed: signals?.filter((s) => !s.processed).length || 0,
    highPriority: signals?.filter((s) => s.priority === 'high').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-white transition-colors hover:bg-agora-border"
        >
          <RefreshCw className="h-4 w-4" />
          {t('refresh')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <Radio className="h-4 w-4" />
            <span className="text-sm">{t('stats.total')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.processed')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.processed}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-warning">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{t('stats.pending')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.unprocessed}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-error">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('stats.highPriority')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{stats.highPriority}</p>
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
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSource === source
                    ? 'bg-agora-primary text-white'
                    : 'bg-agora-card text-agora-muted hover:bg-agora-border'
                }`}
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showProcessed === status
                  ? 'bg-agora-accent text-white'
                  : 'bg-agora-card text-agora-muted hover:bg-agora-border'
              }`}
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
            />
          ))}
        </div>
      ) : filteredSignals?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-agora-border p-8 text-center">
          <Radio className="mx-auto h-12 w-12 text-agora-muted/50" />
          <h3 className="mt-4 text-lg font-semibold text-white">{t('noSignals')}</h3>
          <p className="mt-2 text-sm text-agora-muted">{t('noSignalsDesc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSignals?.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
