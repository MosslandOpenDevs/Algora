// Single source of truth for supported locales.
// Keep middleware, request config, layout, and sitemap in sync via this module.
export const locales = ['en', 'ko', 'ja', 'zh'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// BCP-47 tags used for hreflang alternates and Open Graph locale.
export const ogLocale: Record<Locale, string> = {
  en: 'en_US',
  ko: 'ko_KR',
  ja: 'ja_JP',
  zh: 'zh_CN',
};
