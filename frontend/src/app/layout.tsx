import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { resolveLocale } from '@/i18n/request';
import { ThemeModeProvider } from '@/providers/ThemeModeProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { LocaleProvider } from '@/providers/LocaleProvider';
import {
  DENSITY_COOKIE,
  THEME_COOKIE,
  isDensity,
  isThemePreference,
  type Density,
  type ThemePreference,
} from '@/providers/preferences';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Gym CRM', template: '%s · Gym CRM' },
  description: 'Gym management: members, memberships, attendance, payments and reporting.',
  // This is an internal tool behind a login; there is nothing here to index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available: capping it fails WCAG 1.4.4 and makes a QR
  // code harder to read for exactly the people who need to enlarge it.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e13' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const messages = await getMessages();
  const jar = await cookies();

  // Read on the server so the first paint is already the right theme,
  // language and density — no flash, no layout shift.
  const themeCookie = jar.get(THEME_COOKIE)?.value;
  const densityCookie = jar.get(DENSITY_COOKIE)?.value;
  const themePreference: ThemePreference = isThemePreference(themeCookie) ? themeCookie : 'system';
  const density: Density = isDensity(densityCookie) ? densityCookie : 'standard';

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LocaleProvider initialLocale={locale}>
              <ThemeModeProvider initialPreference={themePreference} initialDensity={density}>
                <QueryProvider>
                  <ToastProvider>{children}</ToastProvider>
                </QueryProvider>
              </ThemeModeProvider>
            </LocaleProvider>
          </NextIntlClientProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
