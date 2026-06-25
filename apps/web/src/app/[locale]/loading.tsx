import { Loader2 } from 'lucide-react';

/**
 * Route-level loading state. Rendered by the App Router while a segment's
 * server data resolves, so navigation never shows a blank frame.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-agora-muted dark:text-agora-dark-muted">
      <Loader2 className="h-8 w-8 animate-spin text-agora-accent" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
