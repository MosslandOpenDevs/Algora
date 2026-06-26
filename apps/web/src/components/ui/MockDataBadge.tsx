'use client';

import { useTranslations } from 'next-intl';
import { Database } from 'lucide-react';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

interface MockDataBadgeProps {
  variant?: 'inline' | 'banner';
  className?: string;
}

export function MockDataBadge({ variant = 'inline', className = '' }: MockDataBadgeProps) {
  const t = useTranslations('MockData');

  if (variant === 'banner') {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 ${className}`}>
        <Database className="h-4 w-4 text-blue-700 dark:text-blue-400" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{t('badge')}</span>
        <HelpTooltip
          content={t('description')}
          title={t('title')}
          position="bottom"
        />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 ${className}`}>
      <Database className="h-3 w-3 text-blue-700 dark:text-blue-400" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
        {t('badge')}
      </span>
    </div>
  );
}

interface MockDataWrapperProps {
  children: React.ReactNode;
  showBadge?: boolean;
}

export function MockDataWrapper({ children, showBadge = true }: MockDataWrapperProps) {
  return (
    <div className="relative">
      {showBadge && (
        <div className="absolute -top-3 right-2 z-10">
          <MockDataBadge />
        </div>
      )}
      {children}
    </div>
  );
}
