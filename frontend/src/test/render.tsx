import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeModeProvider } from '@/providers/ThemeModeProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { LocaleProvider } from '@/providers/LocaleProvider';
import { SessionProvider } from '@/providers/SessionProvider';
import { getMessages } from '@/i18n/messages';
import type { Locale } from '@/i18n/config';
import type { User, UserRole } from '@/lib/api/types';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'olivia@gym.local',
    role: 'ADMIN',
    status: 'ACTIVE',
    firstName: 'Olivia',
    lastName: 'Owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as User;
}

export function makeUserWithRole(role: UserRole): User {
  return makeUser({ role });
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  locale?: Locale;
  user?: User | null;
  mode?: 'light' | 'dark';
}

/**
 * Renders a component inside the same providers the real application uses,
 * with real translation bundles rather than stubs — so a test failing on a
 * missing key is telling the truth about production.
 */
export async function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const { locale = 'en', user = makeUser(), mode = 'light', ...rest } = options;
  const messages = await getMessages(locale);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    // Same nesting as the real application: the session sits inside the query
    // client, because signing out has to be able to clear the cache.
    const inner = user ? <SessionProvider user={user}>{children}</SessionProvider> : children;
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tashkent">
        <LocaleProvider initialLocale={locale}>
          <ThemeModeProvider initialPreference={mode} initialDensity="standard">
            <QueryClientProvider client={queryClient}>
              <ToastProvider>{inner}</ToastProvider>
            </QueryClientProvider>
          </ThemeModeProvider>
        </LocaleProvider>
      </NextIntlClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...rest }) };
}
