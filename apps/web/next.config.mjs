import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@algora/core'],
  experimental: {
    typedRoutes: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Reduce file watching to prevent EMFILE errors
      config.watchOptions = {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/.turbo/**',
          '**/coverage/**',
          '**/*.log',
        ],
        poll: 2000,
        aggregateTimeout: 500,
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
