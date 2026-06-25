'use client';

import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

interface AllocationStats {
  pending: number;
  approved: number;
  disbursed: number;
  cancelled: number;
}

interface AllocationStatusBreakdownProps {
  stats: AllocationStats;
}

const statusConfig = {
  pending: { color: '#eab308', label: 'pending' }, // yellow
  approved: { color: '#3b82f6', label: 'approved' }, // blue
  disbursed: { color: '#22c55e', label: 'disbursed' }, // green
  cancelled: { color: '#ef4444', label: 'cancelled' }, // red
};

export function AllocationStatusBreakdown({ stats }: AllocationStatusBreakdownProps) {
  const t = useTranslations('Treasury');

  const total = stats.pending + stats.approved + stats.disbursed + stats.cancelled;

  const getPercentage = (value: number) => {
    if (total === 0) return 0;
    return (value / total) * 100;
  };

  const statusData = Object.entries(statusConfig).map(([key, config]) => ({
    key,
    count: stats[key as keyof AllocationStats],
    percentage: getPercentage(stats[key as keyof AllocationStats]),
    ...config,
  }));

  const hasData = total > 0;

  return (
    <div className="rounded-xl border border-agora-border bg-agora-card p-6">
      <h3 className="mb-4 text-lg font-semibold text-agora-text">{t('allocationBreakdown')}</h3>

      {hasData ? (
        <>
          {/* Stacked Progress Bar */}
          <div className="mb-4 h-4 overflow-hidden rounded-full bg-agora-border">
            <div className="flex h-full">
              {statusData
                .filter((s) => s.percentage > 0)
                .map((s, index) => (
                  <div
                    key={s.key}
                    className="h-full transition-all"
                    style={{
                      width: `${s.percentage}%`,
                      backgroundColor: s.color,
                      marginLeft: index > 0 ? '1px' : 0,
                    }}
                    title={`${s.label}: ${s.count}`}
                  />
                ))}
            </div>
          </div>

          {/* Legend Grid */}
          <div className="grid grid-cols-2 gap-3">
            {statusData.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-lg bg-agora-dark/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-sm text-agora-muted">
                    {t(`allocation.${s.label}`)}
                  </span>
                </div>
                <span className="font-semibold text-agora-text">{s.count}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-4 flex items-center justify-between border-t border-agora-border pt-4">
            <span className="text-sm text-agora-muted">{t('stats.allocations')}</span>
            <span className="font-bold text-agora-text">{total}</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <FileText className="h-12 w-12 text-agora-muted" />
          <p className="mt-4 text-agora-muted">{t('noAllocations')}</p>
        </div>
      )}
    </div>
  );
}
