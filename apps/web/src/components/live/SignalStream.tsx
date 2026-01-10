'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistanceToNow, isValid } from 'date-fns';
import { TerminalBox, StatusGlyph } from './TerminalBox';
import { useSocket } from '@/hooks/useSocket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'just now';
  const date = new Date(timestamp);
  if (!isValid(date)) return 'just now';
  return formatDistanceToNow(date, { addSuffix: true });
}

interface Signal {
  id: string;
  source: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  timestamp: string;
  value?: number;
  unit?: string;
}

interface SignalStreamProps {
  className?: string;
  maxItems?: number;
}

async function fetchRecentSignals(limit: number): Promise<Signal[]> {
  const res = await fetch(`${API_URL}/api/signals?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch signals');
  const data = await res.json();
  // API returns { signals: [...], total: number }
  return data.signals || [];
}

function getSourceType(source: string): 'rss' | 'git' | 'chain' | 'api' {
  if (source.startsWith('rss:')) return 'rss';
  if (source.startsWith('github:')) return 'git';
  if (source.startsWith('blockchain:')) return 'chain';
  return 'api';
}

function getSourceLabel(source: string): string {
  const parts = source.split(':');
  return parts[1] || parts[0];
}

const sourceColors: Record<string, string> = {
  rss: 'text-cyan-600',
  git: 'text-purple-600',
  chain: 'text-emerald-600',
  api: 'text-amber-600',
};

const severityColors: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-slate-500',
};

export function SignalStream({ className, maxItems = 20 }: SignalStreamProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [newSignalId, setNewSignalId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscribe, isConnected } = useSocket();

  // Initial fetch
  const { data: initialSignals } = useQuery({
    queryKey: ['signals', maxItems],
    queryFn: () => fetchRecentSignals(maxItems),
  });

  // Set initial signals
  useEffect(() => {
    if (initialSignals) {
      setSignals(initialSignals);
    }
  }, [initialSignals]);

  // Subscribe to real-time signals
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe('signals:collected', (data: unknown) => {
      const { signal } = data as { signal: Signal };
      setSignals((prev) => {
        const newSignals = [signal, ...prev].slice(0, maxItems);
        return newSignals;
      });
      setNewSignalId(signal.id);

      // Clear highlight after animation
      setTimeout(() => setNewSignalId(null), 2000);
    });

    return unsubscribe;
  }, [isConnected, subscribe, maxItems]);

  return (
    <TerminalBox
      title="SIGNAL STREAM"
      className={className}
      headerRight={
        <div className="flex items-center gap-2 text-xs">
          <StatusGlyph status={isConnected ? 'active' : 'idle'} />
          <span className={isConnected ? 'text-emerald-600' : 'text-slate-500'}>
            {isConnected ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
      }
    >
      <div
        ref={containerRef}
        className="space-y-2 max-h-[400px] overflow-y-auto pr-2"
      >
        {signals.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] text-xs py-4">
            Awaiting signals...
          </div>
        ) : (
          signals.map((signal) => {
            const sourceType = getSourceType(signal.source);
            const isNew = signal.id === newSignalId;

            return (
              <div
                key={signal.id}
                className={clsx(
                  'text-xs p-2 rounded transition-all duration-300',
                  isNew && 'bg-[var(--live-glow-subtle)] animate-highlight'
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={clsx(sourceColors[sourceType], 'font-medium shrink-0')}>
                    {sourceType.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-bright)] truncate">
                        {getSourceLabel(signal.source)}
                      </span>
                      <span className={clsx(severityColors[signal.severity], 'text-[10px] uppercase')}>
                        {signal.severity}
                      </span>
                    </div>
                    <p className="text-[var(--text-muted)] truncate mt-0.5">
                      {signal.description}
                    </p>
                    <span className="text-[var(--text-dim)] text-[10px]">
                      {formatTimestamp(signal.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </TerminalBox>
  );
}
