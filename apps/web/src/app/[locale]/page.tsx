import type { Metadata } from 'next';

import { getDashboardData } from '@/lib/server-api';
import { DashboardClient } from '@/components/dashboard';
import { defaultLocale, isLocale, locales } from '@/i18n/locales';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://algora.moss.land';

// Home is a Server Component, so it can emit a path-correct, self-referential
// canonical + reciprocal hreflang for the locale root. Sub-pages are Client
// Components (no generateMetadata); they self-canonicalize and rely on
// sitemap.xml for per-path hreflang.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;

  return {
    // Only `alternates` here — do NOT set openGraph, or it would replace
    // (not deep-merge) the layout's og:image/title/etc. on the home page.
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        ...Object.fromEntries(locales.map(l => [l, `${siteUrl}/${l}`])),
        'x-default': `${siteUrl}/${defaultLocale}`,
      },
    },
  };
}

/**
 * Dashboard Page - Server Component
 *
 * This page uses React Server Components (RSC) to fetch data on the server
 * before sending HTML to the client. This eliminates the loading spinner
 * on initial page load and improves Time to First Contentful Paint (FCP).
 *
 * Data flow:
 * 1. Server fetches stats, agents, activities in parallel
 * 2. Server renders HTML with initial data
 * 3. Client receives pre-rendered HTML (instant display)
 * 4. Client hydrates and React Query takes over for real-time updates
 */
export default async function DashboardPage() {
  // Fetch all dashboard data on the server (parallel requests)
  const { stats, agents, activities } = await getDashboardData();

  return (
    <DashboardClient
      initialStats={stats}
      initialAgents={agents}
      initialActivities={activities}
    />
  );
}
