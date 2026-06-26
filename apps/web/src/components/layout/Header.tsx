'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Globe, Activity, Clock, Wallet, Menu, Sun, Moon, Check } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { defaultLocale, isLocale, locales, localeNames } from '@/i18n/locales';

export function Header() {
  const t = useTranslations('Header');
  const th = useTranslations('HelpTooltips');
  const pathname = usePathname();
  const [showTour, setShowTour] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const localeSegment = pathname.split('/')[1] ?? '';
  const currentLocale = isLocale(localeSegment) ? localeSegment : defaultLocale;
  // Strip only the leading locale segment; '' for the home route so the
  // switcher emits `/ko` (not `/ko/`, which would 308-redirect).
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '');

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

  const rawStatus = health?.status || 'unknown';
  const isHealthy = rawStatus === 'ok' || rawStatus === 'running';
  const isDegraded = rawStatus === 'degraded';

  return (
    <TooltipProvider>
      <header
        role="banner"
        aria-label={t('mainNavigation')}
        className="flex h-14 items-center justify-between border-b border-agora-border dark:border-agora-dark-border bg-agora-dark dark:bg-agora-dark-dark px-3 md:px-6"
      >
        {/* Left section */}
        <div className="flex items-center gap-3 md:gap-6">
          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="md:hidden p-2 -ml-1 rounded-lg text-agora-muted hover:bg-agora-card hover:text-agora-text transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Mobile logo */}
          <Link href={`/${currentLocale}`} className="md:hidden flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-agora-primary to-agora-accent">
              <span className="text-sm font-bold text-slate-900">A</span>
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Algora</span>
          </Link>

          {/* System Status - Desktop only */}
          <div
            className="hidden lg:flex items-center gap-2"
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
          <div className="hidden xl:flex items-center gap-2">
            <Wallet className="h-4 w-4 text-agora-muted" />
            <span className="text-sm text-agora-muted">{t('budget')}:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              ${health?.budget?.remaining?.toFixed(2) || '0.00'}
            </span>
            <HelpTooltip content={th('budget')} position="bottom" />
          </div>

          {/* Next Tier2 - Desktop only */}
          <div className="hidden 2xl:flex items-center gap-2">
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
          <div className="hidden 2xl:flex items-center gap-2">
            <span className="text-sm text-agora-muted">{t('queue')}:</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {health?.scheduler?.queueLength || 0}
            </span>
            <HelpTooltip content={th('queue')} position="bottom" />
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3">
          {/* Global Search */}
          <GlobalSearch />

          {/* Mobile status indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="md:hidden flex items-center gap-1.5 p-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isHealthy
                      ? 'bg-agora-success animate-pulse'
                      : isDegraded
                        ? 'bg-agora-warning'
                        : 'bg-agora-muted'
                  }`}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('systemStatus')}: {isHealthy ? t('running') : isDegraded ? t('degraded') : t('maintenance')}</p>
            </TooltipContent>
          </Tooltip>

          {/* LIVE Badge */}
          <Link
            href={`/${currentLocale}/live`}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-red-700 dark:text-red-400 transition-all hover:bg-red-500/20 hover:scale-105 min-h-[36px]"
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

          {/* Help Menu - Desktop only (lg+ to keep the tablet header uncrowded) */}
          <div className="hidden lg:block">
            <HelpMenu onStartTour={() => setShowTour(true)} />
          </div>

          {/* Alert Notifications */}
          <AlertDropdown />

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center rounded-md p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 dark:hover:text-white min-h-[36px] min-w-[36px]"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</p>
            </TooltipContent>
          </Tooltip>

          {/* Language Switcher — compact dropdown (1-icon footprint on mobile,
              scales to N locales without crowding the header) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('selectLanguage')}
                className="flex min-h-[36px] items-center gap-1 rounded-md px-2 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 dark:hover:text-white"
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span className="hidden text-xs font-medium uppercase sm:inline">
                  {currentLocale}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem]">
              {locales.map(locale => {
                const active = locale === currentLocale;
                return (
                  <DropdownMenuItem key={locale} asChild>
                    <Link
                      href={`/${locale}${pathWithoutLocale}`}
                      hrefLang={locale}
                      lang={locale}
                      aria-current={active ? 'true' : undefined}
                      className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 ${
                        active ? 'font-semibold text-slate-900 dark:text-white' : ''
                      }`}
                    >
                      <span>
                        {localeNames[locale]}
                        {active && <span className="sr-only"> (current)</span>}
                      </span>
                      {active && (
                        <Check
                          className="h-4 w-4 text-agora-success"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <MobileNav isOpen={isMobileNavOpen} onOpenChange={setIsMobileNavOpen} />

      {/* Welcome Tour */}
      <WelcomeTour forceShow={showTour} onComplete={() => setShowTour(false)} />
    </TooltipProvider>
  );
}
