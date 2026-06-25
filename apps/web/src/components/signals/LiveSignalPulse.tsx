'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Zap, Clock, TrendingUp, Radio } from 'lucide-react';
import { fetchLiveSignalStats } from '@/lib/api';
import { useWittyMessage } from '@/hooks/useWittyMessage';

interface TimeStatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  pulse?: boolean;
}

function TimeStatCard({ label, value, icon, color, pulse }: TimeStatCardProps) {
  return (
    <div className={`relative rounded-lg border border-agora-border bg-agora-card p-2 sm:p-3 transition-all hover:border-${color}/50`}>
      {pulse && value > 0 && (
        <span className={`absolute top-1 right-1 sm:top-2 sm:right-2 h-2 w-2 rounded-full bg-${color} animate-ping`} />
      )}
      <div className="flex items-center gap-1 sm:gap-2 text-agora-muted mb-0.5 sm:mb-1">
        {icon}
        <span className="text-[10px] sm:text-xs uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className={`text-lg sm:text-2xl font-bold text-${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

interface MiniBarChartProps {
  data: Array<{ label: string; value: number }>;
  maxBars?: number;
  color?: string;
}

function MiniBarChart({ data, maxBars = 10, color = 'agora-primary' }: MiniBarChartProps) {
  const displayData = data.slice(-maxBars);
  const maxValue = Math.max(...displayData.map(d => d.value), 1);

  return (
    <div className="flex items-end gap-0.5 h-12">
      {displayData.map((item, index) => {
        const height = (item.value / maxValue) * 100;
        return (
          <div
            key={item.label}
            className="flex-1 min-w-[4px] rounded-t transition-all duration-300"
            style={{
              height: `${Math.max(height, 4)}%`,
              backgroundColor: `var(--${color})`,
              opacity: 0.3 + (index / displayData.length) * 0.7,
            }}
            title={`${item.label}: ${item.value}`}
          />
        );
      })}
    </div>
  );
}

interface PulseRingProps {
  rate: number;
  maxRate?: number;
}

function PulseRing({ rate, maxRate = 10 }: PulseRingProps) {
  const intensity = Math.min(rate / maxRate, 1);
  const pulseSpeed = rate > 0 ? Math.max(0.5, 2 - intensity * 1.5) : 0;

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full border-2 border-agora-primary/30"
        style={{
          animation: rate > 0 ? `ping ${pulseSpeed}s cubic-bezier(0, 0, 0.2, 1) infinite` : 'none',
        }}
      />
      {/* Middle ring */}
      <div
        className="absolute inset-2 rounded-full border-2 border-agora-primary/50"
        style={{
          animation: rate > 0 ? `ping ${pulseSpeed * 0.8}s cubic-bezier(0, 0, 0.2, 1) infinite` : 'none',
          animationDelay: '0.2s',
        }}
      />
      {/* Inner circle */}
      <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-agora-primary/20">
        <Radio className="h-4 w-4 text-agora-primary" />
      </div>
    </div>
  );
}

export function LiveSignalPulse() {
  const { message: wittyMessage } = useWittyMessage({
    category: 'signal',
    interval: 4000,
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['live-signal-stats'],
    queryFn: fetchLiveSignalStats,
    refetchInterval: 5000, // Refresh every 5 seconds for live feel
  });

  if (isLoading || !stats) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-card p-4">
        <div className="flex items-center gap-2 text-agora-muted">
          <Radio className="h-4 w-4 animate-pulse" />
          <span className="text-sm italic">{wittyMessage}</span>
        </div>
      </div>
    );
  }

  const { timeStats, minuteBreakdown, ratePerMinute } = stats;

  // Prepare minute chart data
  const minuteData = minuteBreakdown.map(m => ({
    label: m.minute,
    value: m.count,
  }));

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-4 space-y-4">
      {/* Header with pulse indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PulseRing rate={ratePerMinute} />
          <div>
            <h3 className="text-lg font-semibold text-agora-text">Signal Pulse</h3>
            <p className="text-xs text-agora-muted italic">{wittyMessage}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-agora-primary">
            {ratePerMinute.toFixed(1)}
          </div>
          <div className="text-xs text-agora-muted">signals/min</div>
        </div>
      </div>

      {/* Time-based stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <TimeStatCard
          label="10 min"
          value={timeStats.last10min}
          icon={<Zap className="h-3 w-3" />}
          color="agora-accent"
          pulse={timeStats.last10min > 0}
        />
        <TimeStatCard
          label="1 hour"
          value={timeStats.lastHour}
          icon={<Clock className="h-3 w-3" />}
          color="agora-primary"
        />
        <TimeStatCard
          label="Today"
          value={timeStats.today}
          icon={<Activity className="h-3 w-3" />}
          color="agora-secondary"
        />
        <TimeStatCard
          label="Week"
          value={timeStats.thisWeek}
          icon={<TrendingUp className="h-3 w-3" />}
          color="slate-600"
        />
        <TimeStatCard
          label="Month"
          value={timeStats.thisMonth}
          icon={<TrendingUp className="h-3 w-3" />}
          color="slate-500"
        />
      </div>

      {/* Live activity chart (last 10 minutes) */}
      {minuteData.length > 0 && (
        <div>
          <div className="text-xs text-agora-muted mb-2">Last 10 minutes activity</div>
          <MiniBarChart data={minuteData} color="agora-primary" />
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between pt-2 border-t border-agora-border">
        <span className="text-sm text-agora-muted">Total signals collected</span>
        <span className="text-lg font-semibold text-agora-text">
          {timeStats.total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact version for sidebar or header
 */
export function LiveSignalBadge() {
  const { data: stats } = useQuery({
    queryKey: ['live-signal-stats'],
    queryFn: fetchLiveSignalStats,
    refetchInterval: 10000,
  });

  if (!stats) return null;

  const { timeStats, ratePerMinute } = stats;
  const isActive = ratePerMinute > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-agora-card border border-agora-border">
      <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-agora-primary animate-pulse' : 'bg-agora-muted'}`} />
      <span className="text-xs font-medium text-agora-text">{timeStats.last10min}</span>
      <span className="text-xs text-agora-muted">signals/10m</span>
    </div>
  );
}
