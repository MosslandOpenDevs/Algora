'use client';

import { Suspense, ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface SuspenseBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  errorFallback?: ReactNode;
}

/**
 * Error fallback component for error boundaries
 */
function DefaultErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-agora-error/30 bg-agora-error/5">
      <AlertCircle className="h-8 w-8 text-agora-error mb-2" />
      <p className="text-agora-text font-medium mb-1">Something went wrong</p>
      <p className="text-agora-muted text-sm mb-4 text-center max-w-md">
        {error.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="flex items-center gap-2 px-4 py-2 bg-agora-primary/20 text-agora-primary rounded-lg hover:bg-agora-primary/30 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}

/**
 * SuspenseBoundary - Combines React Suspense with Error Boundary
 *
 * Provides both loading states and error handling in one component.
 *
 * Usage:
 * ```tsx
 * <SuspenseBoundary fallback={<CardSkeleton />}>
 *   <AsyncComponent />
 * </SuspenseBoundary>
 * ```
 */
export function SuspenseBoundary({
  children,
  fallback,
  errorFallback,
}: SuspenseBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) =>
        errorFallback || (
          <DefaultErrorFallback
            error={error}
            resetErrorBoundary={resetErrorBoundary}
          />
        )
      }
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * WithSuspense HOC - Wraps a component with SuspenseBoundary
 *
 * Usage:
 * ```tsx
 * const LazyComponent = withSuspense(
 *   lazy(() => import('./MyComponent')),
 *   <CardSkeleton />
 * );
 * ```
 */
export function withSuspense<P extends object>(
  Component: React.ComponentType<P>,
  fallback: ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <SuspenseBoundary fallback={fallback}>
        <Component {...props} />
      </SuspenseBoundary>
    );
  };
}
