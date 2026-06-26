import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './locales';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // Validate that the incoming locale is supported
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
