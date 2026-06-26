'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical, X, AlertTriangle } from 'lucide-react';

export function ExperimentalBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const t = useTranslations('Experimental');

  if (!isVisible) return null;

  return (
    <div className="relative z-10 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-b border-amber-500/30">
      <div className="mx-auto max-w-7xl px-4 py-2.5 pr-10 sm:px-6 sm:pr-12 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {t('badge')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700/90 dark:text-amber-400/90 line-clamp-2 sm:line-clamp-1">
              {t('description')}
            </p>
          </div>
        </div>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-500/20 hover:text-amber-700 dark:hover:text-amber-400 sm:right-4"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
