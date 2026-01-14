'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Globe, Activity, Clock, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { HelpMenu } from '@/components/guide/HelpMenu';
import { WelcomeTour } from '@/components/guide/WelcomeTour';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

export function Header() {
  const t = useTranslations('Header');
  const th = useTranslations('HelpTooltips');
  const pathname = usePathname();
  const [showTour, setShowTour] = useState(false);

  const currentLocale = pathname.split('/')[1] || 'en';
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';
  const otherLocale = currentLocale === 'en' ? 'ko' : 'en';

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201'}/health`
      );
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Normalize status: 'ok' and 'running' both mean healthy
  const rawStatus = health?.status || 'unknown';
  const isHealthy = rawStatus === 'ok' || rawStatus === 'running';
  const isDegraded = rawStatus === 'degraded';

  return (
    <header className="flex h-14 items-center justify-between border-b border-agora-border bg-agora-dark px-6">
      <div className="flex items-center gap-6">
        {/* System Status */}
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-agora-muted" />
          <span className="text-sm text-agora-muted">{t('systemStatus')}:</span>
          <span
            className={`flex items-center gap-1.5 text-sm font-medium ${
              isHealthy
                ? 'text-agora-success'
                : isDegraded
                  ? 'text-agora-warning'
                  : 'text-agora-muted'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-agora-success animate-pulse'
                  : isDegraded
                    ? 'bg-agora-warning'
                    : 'bg-agora-muted'
              }`}
            />
            {isHealthy
              ? t('running')
              : isDegraded
                ? t('degraded')
                : t('maintenance')}
          </span>
          <HelpTooltip content={th('systemStatus')} position="bottom" />
        </div>

        {/* Budget */}
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-agora-muted" />
          <span className="text-sm text-agora-muted">{t('budget')}:</span>
          <span className="text-sm font-medium text-slate-900">
            ${health?.budget?.remaining?.toFixed(2) || '0.00'}
          </span>
          <HelpTooltip content={th('budget')} position="bottom" />
        </div>

        {/* Next Tier2 */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-agora-muted" />
          <span className="text-sm text-agora-muted">{t('nextTier2')}:</span>
          <span className="text-sm font-medium text-agora-accent">
            {health?.scheduler?.nextTier2
              ? new Date(health.scheduler.nextTier2).toLocaleTimeString()
              : '--:--'}
          </span>
          <HelpTooltip content={th('nextTier2')} position="bottom" />
        </div>

        {/* Queue */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-agora-muted">{t('queue')}:</span>
          <span className="text-sm font-medium text-slate-900">
            {health?.scheduler?.queueLength || 0}
          </span>
          <HelpTooltip content={th('queue')} position="bottom" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* LIVE Badge */}
        <Link
          href={`/${currentLocale}/live`}
          className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 transition-all hover:bg-red-500/20 hover:scale-105"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          LIVE
        </Link>

        {/* Wallet Connect */}
        <WalletConnect />

        {/* Help Menu */}
        <HelpMenu onStartTour={() => setShowTour(true)} />

        {/* Language Toggle */}
        <Link
          href={`/${otherLocale}${pathWithoutLocale}`}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        >
          <Globe className="h-4 w-4" />
          <span>{otherLocale === 'en' ? 'EN' : '한국어'}</span>
        </Link>
      </div>

      {/* Welcome Tour */}
      <WelcomeTour forceShow={showTour} onComplete={() => setShowTour(false)} />
    </header>
  );
}
