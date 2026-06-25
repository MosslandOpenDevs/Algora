'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, TrendingUp, Cog, Code, Megaphone, Shield, Briefcase } from 'lucide-react';

export interface SpendingLimit {
  id: string;
  category: string;
  tokenAddress: string;
  tokenSymbol: string;
  dailyLimit: string | null;
  weeklyLimit: string | null;
  monthlyLimit: string | null;
  requiresProposal: boolean;
  currentDaily: string;
  currentWeekly: string;
  currentMonthly: string;
}

interface SpendingLimitsCardProps {
  limits: SpendingLimit[];
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  operations: Cog,
  development: Code,
  marketing: Megaphone,
  security: Shield,
  business: Briefcase,
};

export function SpendingLimitsCard({ limits }: SpendingLimitsCardProps) {
  const t = useTranslations('Treasury');

  const formatAmount = (amount: string | null, decimals: number = 18): number => {
    if (!amount || amount === '0') return 0;
    return Number(BigInt(amount) / BigInt(10 ** decimals));
  };

  const getProgressColor = (used: number, limit: number) => {
    if (limit === 0) return 'bg-agora-muted';
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-agora-success';
  };

  const getProgressPercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const hasLimits = limits.length > 0;

  return (
    <div className="rounded-xl border border-agora-border bg-agora-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-agora-text">{t('spendingLimits.title')}</h3>
        <span className="text-xs text-agora-muted">{t('spendingLimits.monthly')}</span>
      </div>

      {hasLimits ? (
        <div className="space-y-4">
          {limits.map((limit) => {
            const Icon = categoryIcons[limit.category.toLowerCase()] || Cog;
            const monthlyLimit = formatAmount(limit.monthlyLimit);
            const currentMonthly = formatAmount(limit.currentMonthly);
            const percentage = getProgressPercentage(currentMonthly, monthlyLimit);
            const isNearLimit = percentage >= 70;

            return (
              <div key={limit.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-agora-accent" />
                    <span className="text-sm font-medium text-agora-text capitalize">
                      {limit.category}
                    </span>
                    {isNearLimit && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-agora-text">
                      {currentMonthly.toLocaleString()}
                    </span>
                    <span className="text-sm text-agora-muted">/</span>
                    <span className="text-sm text-agora-muted">
                      {monthlyLimit.toLocaleString()} {limit.tokenSymbol}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 overflow-hidden rounded-full bg-agora-border">
                  <div
                    className={`h-full transition-all ${getProgressColor(currentMonthly, monthlyLimit)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* Sub-limits */}
                <div className="flex justify-between text-xs text-agora-muted">
                  <span>
                    {t('spendingLimits.daily')}: {formatAmount(limit.currentDaily).toLocaleString()}/
                    {formatAmount(limit.dailyLimit).toLocaleString()}
                  </span>
                  <span>
                    {t('spendingLimits.weekly')}: {formatAmount(limit.currentWeekly).toLocaleString()}/
                    {formatAmount(limit.weeklyLimit).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <TrendingUp className="h-12 w-12 text-agora-muted" />
          <p className="mt-4 text-agora-muted">{t('spendingLimits.noLimits')}</p>
        </div>
      )}
    </div>
  );
}
