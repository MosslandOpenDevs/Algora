'use client';

import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';

export interface TreasuryBalance {
  tokenAddress: string;
  tokenSymbol: string;
  balance: string;
  balanceFormatted: number;
  usdValue?: number;
}

interface BalanceDistributionChartProps {
  balances: TreasuryBalance[];
}

const tokenColors: Record<string, string> = {
  MOC: '#22c55e', // green
  ETH: '#3b82f6', // blue
  USDC: '#8b5cf6', // purple
  USDT: '#06b6d4', // cyan
  default: '#64748b', // slate
};

export function BalanceDistributionChart({ balances }: BalanceDistributionChartProps) {
  const t = useTranslations('Treasury');

  // Calculate total USD value (if available) or use balanceFormatted sum
  const totalValue = balances.reduce((sum, b) => sum + (b.usdValue || b.balanceFormatted), 0);

  // Calculate percentages for each balance
  const balanceData = balances
    .filter((b) => b.balanceFormatted > 0)
    .map((b) => ({
      ...b,
      percentage: totalValue > 0 ? ((b.usdValue || b.balanceFormatted) / totalValue) * 100 : 0,
      color: tokenColors[b.tokenSymbol] || tokenColors.default,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Create conic-gradient stops
  let cumulativePercentage = 0;
  const gradientStops = balanceData
    .map((b) => {
      const start = cumulativePercentage;
      cumulativePercentage += b.percentage;
      return `${b.color} ${start}% ${cumulativePercentage}%`;
    })
    .join(', ');

  const hasData = balanceData.length > 0;

  return (
    <div className="rounded-xl border border-agora-border bg-agora-card p-6">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">{t('balanceDistribution')}</h3>

      {hasData ? (
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Donut Chart */}
          <div className="relative flex-shrink-0">
            <div
              className="h-28 w-28 sm:h-32 sm:w-32 rounded-full"
              style={{
                background: `conic-gradient(${gradientStops})`,
              }}
            >
              {/* Inner circle for donut effect */}
              <div className="absolute left-1/2 top-1/2 flex h-16 w-16 sm:h-20 sm:w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-agora-card">
                <div className="text-center">
                  <Coins className="mx-auto h-4 w-4 sm:h-5 sm:w-5 text-agora-accent" />
                  <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs font-medium text-agora-muted leading-tight">{t('stats.totalBalance')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 w-full space-y-2 min-w-0">
            {balanceData.map((b) => (
              <div key={b.tokenSymbol} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="text-sm font-medium text-slate-900">{b.tokenSymbol}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900">
                    {b.balanceFormatted.toLocaleString()}
                  </span>
                  <span className="ml-1.5 sm:ml-2 text-xs text-agora-muted">
                    ({b.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <Coins className="h-12 w-12 text-agora-muted" />
          <p className="mt-4 text-agora-muted">{t('noBalances')}</p>
        </div>
      )}
    </div>
  );
}
