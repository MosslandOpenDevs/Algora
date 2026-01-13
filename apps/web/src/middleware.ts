import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'ko'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export const config = {
  // Match all paths except static files and API
  matcher: [
    '/((?!_next|api|favicon.ico|icon|.*\\..*).*)',
    '/',
    '/(en|ko)/:path*',
  ],
};
