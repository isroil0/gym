/**
 * The three languages the gym operates in. Uzbek is the default because that is
 * what the staff at the front desk speak; English is the fallback used when a
 * key is missing, since it is the language the keys themselves are written in.
 */
export const LOCALES = ['uz', 'en', 'ru'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz';
export const FALLBACK_LOCALE: Locale = 'en';

/** Cookie name holding the reader's chosen language. */
export const LOCALE_COOKIE = 'gym_locale';

/** One year: long enough that a returning member never has to re-choose. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  uz: "O'zbekcha",
  en: 'English',
  ru: 'Русский',
};

/** BCP-47 tags for Intl formatting. */
export const INTL_LOCALES: Record<Locale, string> = {
  uz: 'uz-Latn-UZ',
  en: 'en-GB',
  ru: 'ru-RU',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
