'use client';

import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  variant?: 'default' | 'warning' | 'success' | 'primary';
  subtitle?: string;
  onClick?: () => void;
}

const variantStyles = {
  default: {
    border: 'border-agora-border',
    bg: 'bg-agora-card',
    icon: 'text-agora-muted',
    value: 'text-slate-900',
    hover: 'hover:border-agora-primary/50 hover:shadow-lg hover:shadow-agora-primary/5',
  },
  warning: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
    icon: 'text-orange-400',
    value: 'text-orange-400',
    hover: 'hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/5',
  },
  success: {
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    icon: 'text-green-400',
    value: 'text-green-400',
    hover: 'hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/5',
  },
  primary: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
    icon: 'text-blue-400',
    value: 'text-blue-400',
    hover: 'hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5',
  },
};

export function StatsCard({
  title,
  value,
  icon,
  trend,
  variant = 'default',
  subtitle,
  onClick,
}: StatsCardProps) {
  const styles = variantStyles[variant];
  const isClickable = !!onClick;

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className={`transition-transform duration-200 group-hover:scale-110 ${styles.icon}`}>
          {icon}
        </span>
        <div className="flex items-center gap-2">
          {trend !== undefined && (
            <div
              className={`flex items-center gap-1 text-xs font-medium ${
                trend > 0
                  ? 'text-green-400'
                  : trend < 0
                    ? 'text-red-400'
                    : 'text-gray-400'
              }`}
            >
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3 animate-pulse" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3 animate-pulse" />
              ) : null}
              <span>
                {trend > 0 ? '+' : ''}
                {trend}%
              </span>
            </div>
          )}
          {isClickable && (
            <ChevronRight className="h-4 w-4 text-agora-muted opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1" />
          )}
        </div>
      </div>
      <div className="mt-3">
        <p className={`text-3xl font-bold tracking-tight ${styles.value}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="mt-1 text-sm text-agora-muted">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-agora-muted/70">{subtitle}</p>
        )}
      </div>
    </>
  );

  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className={`
          group w-full rounded-lg border p-4 text-left
          transition-all duration-200
          ${styles.border} ${styles.bg} ${styles.hover}
          hover:scale-[1.02] active:scale-[0.98]
          cursor-pointer
        `}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${styles.border} ${styles.bg}`}>
      {content}
    </div>
  );
}
