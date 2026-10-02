'use client';

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/i18n/config';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** True while the new language is being fetched. */
  isPending: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [isPending, startTransition] = useTransition();

  /**
   * Switching language writes a cookie and refreshes the server components.
   *
   * It deliberately does not navigate. The URL is unchanged, so the reader
   * stays on the same record with the same filters, and because `router.refresh`
   * re-renders rather than remounts, a half-filled form keeps what was typed
   * into it.
   */
  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      setLocaleState(next);
      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  const value = useMemo(() => ({ locale, setLocale, isPending }), [locale, setLocale, isPending]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
