import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  variant?: 'default' | 'warning';
}

export function StatsCard({
  title,
  value,
  icon,
  trend,
  variant = 'default',
}: StatsCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        variant === 'warning'
          ? 'border-agora-warning/30 bg-agora-warning/5'
          : 'border-agora-border bg-agora-card'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`${variant === 'warning' ? 'text-agora-warning' : 'text-agora-muted'}`}
        >
          {icon}
        </span>
        {trend !== undefined && (
          <div
            className={`flex items-center gap-1 text-xs ${
              trend > 0
                ? 'text-agora-success'
                : trend < 0
                  ? 'text-agora-error'
                  : 'text-agora-muted'
            }`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            <span>
              {trend > 0 ? '+' : ''}
              {trend}%
            </span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p
          className={`text-2xl font-bold ${
            variant === 'warning' ? 'text-agora-warning' : 'text-white'
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-sm text-agora-muted">{title}</p>
      </div>
    </div>
  );
}
