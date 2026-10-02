import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, INTL_LOCALES, LOCALE_COOKIE, isLocale, type Locale } from './config';
import { getMessages } from './messages';

/**
 * Locale is carried in a cookie rather than a URL segment. Switching language
 * then never changes the address, which keeps the reader exactly where they
 * were — same page, same filters, same half-filled form.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: await getMessages(locale),
    // The gym's wall clock. Server and browser must agree or hydration warns.
    timeZone: process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Tashkent',
    formats: {
      dateTime: {
        short: { day: '2-digit', month: '2-digit', year: 'numeric' },
        long: { day: 'numeric', month: 'long', year: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit' },
      },
      number: {
        money: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      },
    },
    getMessageFallback: ({ namespace, key }) => `${namespace ?? ''}.${key}`,
    onError: () => {
      /* Missing keys fall back to English via mergeDeep; silence the noise. */
    },
  };
});

export { INTL_LOCALES };
