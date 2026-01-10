'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, isValid } from 'date-fns';

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return '--:--:--';
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '--:--:--';
    return format(date, 'HH:mm:ss');
  } catch {
    return '--:--:--';
  }
}
import { TerminalHeader, StatusGlyph } from './TerminalBox';
import { useSocket } from '@/hooks/useSocket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface Activity {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  agent_id?: string;
  details?: Record<string, unknown>;
}

interface ActivityLogProps {
  className?: string;
  maxItems?: number;
}

async function fetchRecentActivity(limit: number): Promise<Activity[]> {
  const res = await fetch(`${API_URL}/api/activity?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch activity');
  const data = await res.json();
  // API returns { activities: [...] }
  return data.activities || [];
}

// Event type icons using ASCII/Unicode glyphs
const typeGlyphs: Record<string, { char: string; color: string }> = {
  SIGNAL: { char: '●', color: 'text-cyan-600' },
  SIGNAL_COLLECTED: { char: '●', color: 'text-cyan-600' },
  ANALYSIS: { char: '◉', color: 'text-purple-600' },
  AI_PROCESSING: { char: '◉', color: 'text-purple-600' },
  ISSUE: { char: '▲', color: 'text-amber-600' },
  ISSUE_CREATED: { char: '▲', color: 'text-amber-600' },
  ISSUE_DETECTED: { char: '▲', color: 'text-amber-600' },
  AGORA: { char: '★', color: 'text-emerald-600' },
  AGORA_SESSION_START: { char: '★', color: 'text-emerald-600' },
  AGORA_ROUND_COMPLETE: { char: '★', color: 'text-emerald-600' },
  AGENT: { char: '█', color: 'text-blue-600' },
  AGENT_SUMMONED: { char: '█', color: 'text-blue-600' },
  AGENT_CHATTER: { char: '█', color: 'text-blue-600' },
  PROPOSAL: { char: '◆', color: 'text-yellow-600' },
  VOTE: { char: '✓', color: 'text-emerald-600' },
  HEARTBEAT: { char: '♥', color: 'text-red-500' },
  COLLECTOR: { char: '⚡', color: 'text-teal-600' },
};

function getTypeGlyph(type: string) {
  const key = Object.keys(typeGlyphs).find((k) => type.toUpperCase().includes(k));
  return typeGlyphs[key || 'SIGNAL'] || typeGlyphs.SIGNAL;
}

export function ActivityLog({ className, maxItems = 50 }: ActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newActivityId, setNewActivityId] = useState<string | null>(null);
  const { subscribe, isConnected } = useSocket();

  // Initial fetch
  const { data: initialActivities } = useQuery({
    queryKey: ['activities', maxItems],
    queryFn: () => fetchRecentActivity(maxItems),
  });

  // Set initial activities
  useEffect(() => {
    if (initialActivities) {
      setActivities(initialActivities);
    }
  }, [initialActivities]);

  // Subscribe to real-time activity
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe('activity:event', (data: unknown) => {
      const activity = data as Activity;
      setActivities((prev) => {
        const newActivities = [activity, ...prev].slice(0, maxItems);
        return newActivities;
      });
      setNewActivityId(activity.id);
      setTimeout(() => setNewActivityId(null), 2000);
    });

    return unsubscribe;
  }, [isConnected, subscribe, maxItems]);

  return (
    <div className={clsx('terminal-box p-3', className)}>
      <div className="flex items-center justify-between mb-3">
        <TerminalHeader>LIVE ACTIVITY</TerminalHeader>
        <StatusGlyph status={isConnected ? 'active' : 'idle'} />
      </div>

      <div className="space-y-1 max-h-[200px] overflow-y-auto font-terminal text-xs">
        {activities.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] py-4">
            Monitoring activity...
          </div>
        ) : (
          activities.slice(0, 10).map((activity) => {
            const glyph = getTypeGlyph(activity.type);
            const isNew = activity.id === newActivityId;
            const time = formatTime(activity.timestamp);

            return (
              <div
                key={activity.id}
                className={clsx(
                  'flex items-start gap-2 py-1 transition-all duration-300',
                  isNew && 'bg-[var(--live-glow-subtle)] animate-highlight'
                )}
              >
                <span className="text-[var(--text-dim)] shrink-0">[{time}]</span>
                <span className={clsx(glyph.color, 'shrink-0')}>{glyph.char}</span>
                <span className="text-[var(--text-muted)] shrink-0 w-16 truncate uppercase">
                  {activity.type.split('_')[0]}
                </span>
                <span className="text-[var(--text-bright)] truncate flex-1">
                  {activity.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
