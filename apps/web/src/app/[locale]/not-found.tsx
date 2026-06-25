'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Compass, ArrowLeft } from 'lucide-react';

/**
 * Locale-segment 404. Keeps the user inside the shell with a way back to the
 * live dashboard instead of a bare browser error page.
 */
export default function NotFound() {
  const locale = useLocale();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-agora-accent/15">
        <Compass className="h-8 w-8 text-agora-accent" />
      </div>
      <div>
        <h2 className="mb-1 text-lg font-semibold text-agora-text dark:text-agora-dark-text">
          Page not found
        </h2>
        <p className="max-w-md text-sm text-agora-muted dark:text-agora-dark-muted">
          This route doesn&apos;t exist. The Agora is still live — head back to the dashboard.
        </p>
      </div>
      <Link
        href={`/${locale}`}
        className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
    </div>
  );
}
