import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  type Locale,
  defaultLocale,
  isLocale,
  locales,
} from '@/i18n/locales';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://algora.moss.land';

// Maps each indexable route segment to the i18n keys reused for its <title>
// (the localized `Navigation` label, which flows through the layout's
// '%s · Algora' template) and its meta description (the section `subtitle`).
// Reusing the existing, fully-translated catalogs means a new route gets
// correct per-locale, self-canonical metadata in a single line.
const PUBLIC_ROUTES = {
  agora: { navKey: 'agora', descNs: 'Agora' },
  agents: { navKey: 'agents', descNs: 'Agents' },
  governance: { navKey: 'governance', descNs: 'Governance' },
  proposals: { navKey: 'proposals', descNs: 'Proposals' },
  treasury: { navKey: 'treasury', descNs: 'Treasury' },
  signals: { navKey: 'signals', descNs: 'Signals' },
  issues: { navKey: 'issues', descNs: 'Issues' },
  timeline: { navKey: 'timeline', descNs: 'Timeline' },
  disclosure: { navKey: 'disclosure' },
  live: { navKey: 'live', descNs: 'Live' },
  engine: { navKey: 'engine', descNs: 'Engine' },
  guide: { navKey: 'guide', descNs: 'Guide' },
} satisfies Record<string, { navKey: string; descNs?: string }>;

export type PublicRoute = keyof typeof PUBLIC_ROUTES;

const coerceLocale = (raw: string): Locale =>
  isLocale(raw) ? raw : defaultLocale;

const absolute = (locale: string, route: string) =>
  `${siteUrl}/${locale}/${route}`;

// Self-referential canonical plus a reciprocal hreflang map (incl. x-default)
// for a given path — the same shape the home page emits, applied per route so
// sub-pages carry hreflang in <head> as well as in sitemap.xml.
function alternates(route: string, locale: Locale): Metadata['alternates'] {
  return {
    canonical: absolute(locale, route),
    languages: {
      ...Object.fromEntries(locales.map(l => [l, absolute(l, route)])),
      'x-default': absolute(defaultLocale, route),
    },
  };
}

/**
 * Localized, self-canonical metadata for an indexable public route.
 *
 * Sub-pages are Client Components and cannot export `generateMetadata`
 * themselves, so each is wrapped by a thin Server `page.tsx` that calls this.
 * Without it every route inherited the layout's single title/description.
 */
export async function pageMetadata(
  route: PublicRoute,
  rawLocale: string,
): Promise<Metadata> {
  const locale = coerceLocale(rawLocale);
  const cfg: { navKey: string; descNs?: string } = PUBLIC_ROUTES[route];

  const nav = await getTranslations({ locale, namespace: 'Navigation' });
  const title = nav(cfg.navKey);

  let description: string | undefined;
  if (cfg.descNs) {
    const t = await getTranslations({ locale, namespace: cfg.descNs });
    description = t('subtitle');
  }

  return {
    title,
    ...(description ? { description } : {}),
    alternates: alternates(route, locale),
  };
}

/**
 * Title-only metadata for auth-gated routes (admin, profile). These are also
 * blocked in robots.txt; the explicit `noindex` is belt-and-suspenders and
 * keeps them out of the index even if linked.
 */
export async function privatePageMetadata(
  navKey: string,
  rawLocale: string,
): Promise<Metadata> {
  const locale = coerceLocale(rawLocale);
  const nav = await getTranslations({ locale, namespace: 'Navigation' });

  return {
    title: nav(navKey),
    robots: { index: false, follow: false },
  };
}

/**
 * Metadata for the dynamic issue-detail route. The issue title is fetched
 * client-side, so we emit a stable localized section title and a
 * self-referential canonical that includes the id.
 */
export async function issueDetailMetadata(
  rawLocale: string,
  id: string,
): Promise<Metadata> {
  const locale = coerceLocale(rawLocale);
  const nav = await getTranslations({ locale, namespace: 'Navigation' });

  return {
    title: nav('issues'),
    alternates: { canonical: `${siteUrl}/${locale}/issues/${id}` },
  };
}
