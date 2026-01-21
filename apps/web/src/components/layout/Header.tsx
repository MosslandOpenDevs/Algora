'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Globe, Activity, Clock, Wallet, Menu, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { HelpMenu } from '@/components/guide/HelpMenu';
import { WelcomeTour } from '@/components/guide/WelcomeTour';
import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { MobileNav } from './MobileNav';
import { useTheme } from '@/contexts/ThemeContext';
import { GlobalSearch } from '@/components/search';
import { AlertDropdown } from '@/components/alerts';

export function Header() {
  const t = useTranslations('Header');
  const th = useTranslations('HelpTooltips');
  const pathname = usePathname();
  const [showTour, setShowTour] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

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
    <>
      <header
        role="banner"
        aria-label={t('mainNavigation')}
        className="flex h-14 items-center justify-between border-b border-agora-border dark:border-agora-dark-border bg-agora-dark dark:bg-agora-dark-dark px-4 md:px-6"
      >
        {/* Left section */}
        <div className="flex items-center gap-4 md:gap-6">
          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-agora-muted hover:bg-agora-card hover:text-slate-900 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Mobile logo */}
          <Link href={`/${currentLocale}`} className="md:hidden flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-agora-primary to-agora-accent">
              <span className="text-sm font-bold text-slate-900">A</span>
            </div>
            <span className="text-lg font-bold text-slate-900">Algora</span>
          </Link>

          {/* System Status - Desktop only */}
          <div
            className="hidden md:flex items-center gap-2"
            role="status"
            aria-live="polite"
            aria-label={`${t('systemStatus')}: ${isHealthy ? t('running') : isDegraded ? t('degraded') : t('maintenance')}`}
          >
            <Activity className="h-4 w-4 text-agora-muted" aria-hidden="true" />
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
                aria-hidden="true"
              />
              {isHealthy
                ? t('running')
                : isDegraded
                  ? t('degraded')
                  : t('maintenance')}
            </span>
            <HelpTooltip content={th('systemStatus')} position="bottom" />
          </div>

          {/* Budget - Desktop only */}
          <div className="hidden lg:flex items-center gap-2">
            <Wallet className="h-4 w-4 text-agora-muted" />
            <span className="text-sm text-agora-muted">{t('budget')}:</span>
            <span className="text-sm font-medium text-slate-900">
              ${health?.budget?.remaining?.toFixed(2) || '0.00'}
            </span>
            <HelpTooltip content={th('budget')} position="bottom" />
          </div>

          {/* Next Tier2 - Desktop only */}
          <div className="hidden xl:flex items-center gap-2">
            <Clock className="h-4 w-4 text-agora-muted" />
            <span className="text-sm text-agora-muted">{t('nextTier2')}:</span>
            <span className="text-sm font-medium text-agora-accent">
              {health?.scheduler?.nextTier2
                ? new Date(health.scheduler.nextTier2).toLocaleTimeString()
                : '--:--'}
            </span>
            <HelpTooltip content={th('nextTier2')} position="bottom" />
          </div>

          {/* Queue - Desktop only */}
          <div className="hidden xl:flex items-center gap-2">
            <span className="text-sm text-agora-muted">{t('queue')}:</span>
            <span className="text-sm font-medium text-slate-900">
              {health?.scheduler?.queueLength || 0}
            </span>
            <HelpTooltip content={th('queue')} position="bottom" />
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Global Search */}
          <div className="hidden sm:block">
            <GlobalSearch />
          </div>

          {/* Mobile status indicator */}
          <div className="md:hidden flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-agora-success animate-pulse'
                  : isDegraded
                    ? 'bg-agora-warning'
                    : 'bg-agora-muted'
              }`}
            />
          </div>

          {/* LIVE Badge */}
          <Link
            href={`/${currentLocale}/live`}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-red-600 transition-all hover:bg-red-500/20 hover:scale-105"
            aria-label={t('viewLiveDashboard')}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="hidden sm:inline">LIVE</span>
          </Link>

          {/* Wallet Connect */}
          <div className="hidden sm:block">
            <WalletConnect />
          </div>

          {/* Help Menu - Desktop only */}
          <div className="hidden md:block">
            <HelpMenu onStartTour={() => setShowTour(true)} />
          </div>

          {/* Alert Notifications */}
          <AlertDropdown />

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 md:gap-2 rounded-md px-2 md:px-3 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 dark:hover:text-white"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {/* Language Toggle */}
          <Link
            href={`/${otherLocale}${pathWithoutLocale}`}
            className="flex items-center gap-1 md:gap-2 rounded-md px-2 md:px-3 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 dark:hover:text-white"
            aria-label={t('switchLanguage', { language: otherLocale === 'en' ? 'English' : '한국어' })}
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{otherLocale === 'en' ? 'EN' : '한국어'}</span>
          </Link>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <MobileNav isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      {/* Welcome Tour */}
      <WelcomeTour forceShow={showTour} onComplete={() => setShowTour(false)} />
    </>
  );
}
