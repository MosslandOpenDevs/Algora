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

export function Header() {
  const t = useTranslations('Header');
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

  const systemStatus = health?.status || 'unknown';

  return (
    <header className="flex h-14 items-center justify-between border-b border-agora-border bg-agora-dark px-6">
      <div className="flex items-center gap-6">
        {/* System Status */}
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-agora-muted" />
          <span className="text-sm text-agora-muted">{t('systemStatus')}:</span>
          <span
            className={`flex items-center gap-1.5 text-sm font-medium ${
              systemStatus === 'running'
                ? 'text-agora-success'
                : systemStatus === 'degraded'
                  ? 'text-agora-warning'
                  : 'text-agora-muted'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                systemStatus === 'running'
                  ? 'bg-agora-success animate-pulse'
                  : systemStatus === 'degraded'
                    ? 'bg-agora-warning'
                    : 'bg-agora-muted'
              }`}
            />
            {systemStatus === 'running'
              ? t('running')
              : systemStatus === 'degraded'
                ? t('degraded')
                : t('maintenance')}
          </span>
        </div>

        {/* Budget */}
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-agora-muted" />
          <span className="text-sm text-agora-muted">{t('budget')}:</span>
          <span className="text-sm font-medium text-slate-900">
            ${health?.budget?.remaining?.toFixed(2) || '0.00'}
          </span>
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
        </div>

        {/* Queue */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-agora-muted">{t('queue')}:</span>
          <span className="text-sm font-medium text-slate-900">
            {health?.scheduler?.queueLength || 0}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
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
