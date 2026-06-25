'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Play, ListOrdered, Timer } from 'lucide-react';
import { safeFormatDate } from '@/lib/utils';

interface SchedulerCardProps {
  scheduler: {
    nextTier2: string | null;
    queueLength: number;
    lastRun?: string | null;
    interval: number;
    tier2Hours?: number[];
  };
}

export function SchedulerCard({ scheduler }: SchedulerCardProps) {
  const t = useTranslations('Engine.scheduler');

  const nextRun = scheduler.nextTier2 ? new Date(scheduler.nextTier2) : null;
  const lastRun = scheduler.lastRun ? new Date(scheduler.lastRun) : null;

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-5">
      <div className="flex items-center gap-2 text-agora-text">
        <Clock className="h-5 w-5 text-agora-warning" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Next Tier2 Run */}
        <div className="rounded-lg bg-agora-darker p-3">
          <div className="flex items-center gap-2 text-agora-muted">
            <Timer className="h-4 w-4" />
            <span className="text-xs">{t('nextTier2')}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-agora-text">
            {nextRun ? safeFormatDate(nextRun, (d) => formatDistanceToNow(d, { addSuffix: false })) : '--:--'}
          </p>
          <p className="text-xs text-agora-muted">
            {nextRun ? safeFormatDate(nextRun, (d) => d.toLocaleTimeString()) : 'Not scheduled'}
          </p>
        </div>

        {/* Queue Length */}
        <div className="rounded-lg bg-agora-darker p-3">
          <div className="flex items-center gap-2 text-agora-muted">
            <ListOrdered className="h-4 w-4" />
            <span className="text-xs">{t('queueLength')}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-agora-text">
            {scheduler.queueLength}
          </p>
          <p className="text-xs text-agora-muted">{t('pendingTasks')}</p>
        </div>

        {/* Tier2 Schedule */}
        <div className="rounded-lg bg-agora-darker p-3">
          <div className="flex items-center gap-2 text-agora-muted">
            <Play className="h-4 w-4" />
            <span className="text-xs">{t('lastRun')}</span>
          </div>
          {lastRun ? (
            <>
              <p className="mt-2 text-lg font-semibold text-agora-text">
                {safeFormatDate(lastRun, (d) => formatDistanceToNow(d, { addSuffix: true }))}
              </p>
              <p className="text-xs text-agora-muted">
                {safeFormatDate(lastRun, (d) => d.toLocaleTimeString())}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold text-agora-text">
                {scheduler.tier2Hours?.join(':00, ')}:00
              </p>
              <p className="text-xs text-agora-muted">Daily schedule</p>
            </>
          )}
        </div>

        {/* Interval */}
        <div className="rounded-lg bg-agora-darker p-3">
          <div className="flex items-center gap-2 text-agora-muted">
            <Clock className="h-4 w-4" />
            <span className="text-xs">{t('interval')}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-agora-text">
            {scheduler.interval}h
          </p>
          <p className="text-xs text-agora-muted">{t('tier2Interval')}</p>
        </div>
      </div>
    </div>
  );
}
