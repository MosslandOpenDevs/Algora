import { defaultLocale, locales } from '@/i18n/locales';

// Static, hand-rolled sitemap so we can emit hreflang alternates
// (<xhtml:link>), which Next 14.1's built-in sitemap serializer does not.
export const dynamic = 'force-static';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://algora.moss.land';

// Public, indexable routes relative to the locale root.
// Auth-gated / private surfaces (admin, profile) are intentionally excluded.
const routes = [
  '',
  'agora',
  'agents',
  'governance',
  'proposals',
  'treasury',
  'signals',
  'issues',
  'timeline',
  'disclosure',
  'live',
  'engine',
  'guide',
] as const;

const pathFor = (locale: string, route: string) =>
  route ? `/${locale}/${route}` : `/${locale}`;

function urlEntry(locale: string, route: string): string {
  const loc = `${siteUrl}${pathFor(locale, route)}`;
  const links = [...locales.map(l => [l, l] as const), ['x-default', defaultLocale] as const]
    .map(
      ([hreflang, l]) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${siteUrl}${pathFor(l, route)}"/>`,
    )
    .join('\n');
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    links,
    `    <changefreq>${route === '' ? 'hourly' : 'daily'}</changefreq>`,
    `    <priority>${route === '' ? '1.0' : '0.7'}</priority>`,
    '  </url>',
  ].join('\n');
}

export function GET(): Response {
  const entries = locales
    .flatMap(locale => routes.map(route => urlEntry(locale, route)))
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
