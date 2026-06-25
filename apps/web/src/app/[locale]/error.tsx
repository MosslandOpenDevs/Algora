'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Route-level error boundary. Catches render/data errors in a segment and
 * offers a retry instead of crashing the whole shell. Client component as
 * required by the App Router.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for debugging; wire to telemetry later.
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-agora-warning/15">
        <AlertTriangle className="h-8 w-8 text-agora-warning" />
      </div>
      <div>
        <h2 className="mb-1 text-lg font-semibold text-agora-text dark:text-agora-dark-text">
          Something went wrong
        </h2>
        <p className="max-w-md text-sm text-agora-muted dark:text-agora-dark-muted">
          This view failed to load. The rest of the platform is still running — try again.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-xs text-agora-muted/70 dark:text-agora-dark-muted/70">
            ref: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
