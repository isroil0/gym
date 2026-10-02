import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  // Only these extensions are treated as routes, so a colocated test file can
  // never be mistaken for a page.
  pageExtensions: ['ts', 'tsx'],
  // The backend's lockfile sits one directory up; name this app's root
  // explicitly so tracing does not guess at the repository root.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  // The API lives in a separate process. Everything the browser needs to reach
  // it is public by definition, so it is read from NEXT_PUBLIC_API_URL.
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material', '@mui/x-charts'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
