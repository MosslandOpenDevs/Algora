'use client';

import { useTranslations } from 'next-intl';
import { Wallet, TrendingDown } from 'lucide-react';

interface BudgetCardProps {
  budget: {
    daily: { limit: number; spent: number; remaining: number };
    monthly: { limit: number; spent: number; remaining: number };
  };
}

export function BudgetCard({ budget }: BudgetCardProps) {
  const t = useTranslations('Engine.budget');

  const dailyPercent = (budget.daily.spent / budget.daily.limit) * 100;
  const monthlyPercent = (budget.monthly.spent / budget.monthly.limit) * 100;

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-5">
      <div className="flex items-center gap-2 text-white">
        <Wallet className="h-5 w-5 text-agora-accent" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      <div className="mt-4 space-y-4">
        {/* Daily Budget */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-agora-muted">{t('daily')}</span>
            <span className="text-white">
              ${budget.daily.spent.toFixed(2)} / ${budget.daily.limit.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-agora-darker overflow-hidden">
            <div
              className={`h-full transition-all ${
                dailyPercent > 80
                  ? 'bg-agora-error'
                  : dailyPercent > 50
                    ? 'bg-agora-warning'
                    : 'bg-agora-success'
              }`}
              style={{ width: `${dailyPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-agora-muted">
            ${budget.daily.remaining.toFixed(2)} {t('remaining')}
          </p>
        </div>

        {/* Monthly Budget */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-agora-muted">{t('monthly')}</span>
            <span className="text-white">
              ${budget.monthly.spent.toFixed(2)} / ${budget.monthly.limit.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-agora-darker overflow-hidden">
            <div
              className={`h-full transition-all ${
                monthlyPercent > 80
                  ? 'bg-agora-error'
                  : monthlyPercent > 50
                    ? 'bg-agora-warning'
                    : 'bg-agora-success'
              }`}
              style={{ width: `${monthlyPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-agora-muted">
            ${budget.monthly.remaining.toFixed(2)} {t('remaining')}
          </p>
        </div>
      </div>

      {/* Warning if low */}
      {dailyPercent > 80 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-agora-error/10 p-3 text-sm text-agora-error">
          <TrendingDown className="h-4 w-4" />
          <span>{t('lowBudgetWarning')}</span>
        </div>
      )}
    </div>
  );
}
