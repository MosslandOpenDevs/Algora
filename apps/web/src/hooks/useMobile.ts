'use client';

import { useState, useEffect } from 'react';

/**
 * Breakpoint values matching Tailwind CSS defaults
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Hook to detect mobile/tablet/desktop viewport
 *
 * Usage:
 * ```tsx
 * const { isMobile, isTablet, isDesktop } = useMobile();
 *
 * return isMobile ? <MobileNav /> : <Sidebar />;
 * ```
 */
export function useMobile() {
  // Use undefined initially to avoid hydration mismatch
  // Server and client both start with undefined, then client updates after mount
  const [windowSize, setWindowSize] = useState<{ width: number; height: number } | undefined>(
    undefined
  );

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    // Set initial size on mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Default to desktop view during SSR to match Tailwind's default (hidden on md:)
  const width = windowSize?.width ?? BREAKPOINTS.lg;
  const height = windowSize?.height ?? 768;

  const isMobile = width < BREAKPOINTS.md;
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg;

  return {
    isMobile,
    isTablet,
    isDesktop,
    width,
    height,
  };
}

/**
 * Hook to detect if screen matches a specific breakpoint
 *
 * Usage:
 * ```tsx
 * const isLargeScreen = useMediaQuery('(min-width: 1024px)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  // Start with false to avoid hydration mismatch
  const [matches, setMatches] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  // Return false during SSR to avoid hydration mismatch
  return mounted ? matches : false;
}

/**
 * Hook to track sidebar open state
 *
 * Usage:
 * ```tsx
 * const { isOpen, open, close, toggle } = useSidebar();
 * ```
 */
export function useSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { isMobile } = useMobile();

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  // Close sidebar on route change (for mobile)
  useEffect(() => {
    const handleRouteChange = () => {
      if (isMobile) {
        setIsOpen(false);
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, [isMobile]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
