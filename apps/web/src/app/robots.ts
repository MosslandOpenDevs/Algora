import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://algora.moss.land';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Auth-gated / private surfaces are locale-prefixed (e.g. /en/admin,
      // /en/profile); keep them out of the index. Mirrors sitemap exclusions.
      disallow: ['/*/admin', '/*/profile'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
