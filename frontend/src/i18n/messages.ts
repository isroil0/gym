import type { AbstractIntlMessages } from 'next-intl';
import { FALLBACK_LOCALE, type Locale } from './config';

/**
 * Every namespace, loaded per locale. Listed explicitly rather than globbed so
 * that a new namespace file which somebody forgot to translate is a type error
 * here instead of a blank screen in production.
 */
const NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'validation',
  'errors',
  'dashboard',
  'members',
  'trainers',
  'memberships',
  'payments',
  'accounting',
  'attendance',
  'workouts',
  'progress',
  'sessions',
  'reports',
  'notifications',
  'settings',
] as const;

export type Namespace = (typeof NAMESPACES)[number];
export const ALL_NAMESPACES: readonly Namespace[] = NAMESPACES;

type Loader = () => Promise<{ default: AbstractIntlMessages }>;

const LOADERS: Record<Locale, Record<Namespace, Loader>> = {
  uz: {
    common: () => import('./locales/uz/common.json'),
    navigation: () => import('./locales/uz/navigation.json'),
    auth: () => import('./locales/uz/auth.json'),
    validation: () => import('./locales/uz/validation.json'),
    errors: () => import('./locales/uz/errors.json'),
    dashboard: () => import('./locales/uz/dashboard.json'),
    members: () => import('./locales/uz/members.json'),
    trainers: () => import('./locales/uz/trainers.json'),
    memberships: () => import('./locales/uz/memberships.json'),
    payments: () => import('./locales/uz/payments.json'),
    accounting: () => import('./locales/uz/accounting.json'),
    attendance: () => import('./locales/uz/attendance.json'),
    workouts: () => import('./locales/uz/workouts.json'),
    progress: () => import('./locales/uz/progress.json'),
    sessions: () => import('./locales/uz/sessions.json'),
    reports: () => import('./locales/uz/reports.json'),
    notifications: () => import('./locales/uz/notifications.json'),
    settings: () => import('./locales/uz/settings.json'),
  },
  en: {
    common: () => import('./locales/en/common.json'),
    navigation: () => import('./locales/en/navigation.json'),
    auth: () => import('./locales/en/auth.json'),
    validation: () => import('./locales/en/validation.json'),
    errors: () => import('./locales/en/errors.json'),
    dashboard: () => import('./locales/en/dashboard.json'),
    members: () => import('./locales/en/members.json'),
    trainers: () => import('./locales/en/trainers.json'),
    memberships: () => import('./locales/en/memberships.json'),
    payments: () => import('./locales/en/payments.json'),
    accounting: () => import('./locales/en/accounting.json'),
    attendance: () => import('./locales/en/attendance.json'),
    workouts: () => import('./locales/en/workouts.json'),
    progress: () => import('./locales/en/progress.json'),
    sessions: () => import('./locales/en/sessions.json'),
    reports: () => import('./locales/en/reports.json'),
    notifications: () => import('./locales/en/notifications.json'),
    settings: () => import('./locales/en/settings.json'),
  },
  ru: {
    common: () => import('./locales/ru/common.json'),
    navigation: () => import('./locales/ru/navigation.json'),
    auth: () => import('./locales/ru/auth.json'),
    validation: () => import('./locales/ru/validation.json'),
    errors: () => import('./locales/ru/errors.json'),
    dashboard: () => import('./locales/ru/dashboard.json'),
    members: () => import('./locales/ru/members.json'),
    trainers: () => import('./locales/ru/trainers.json'),
    memberships: () => import('./locales/ru/memberships.json'),
    payments: () => import('./locales/ru/payments.json'),
    accounting: () => import('./locales/ru/accounting.json'),
    attendance: () => import('./locales/ru/attendance.json'),
    workouts: () => import('./locales/ru/workouts.json'),
    progress: () => import('./locales/ru/progress.json'),
    sessions: () => import('./locales/ru/sessions.json'),
    reports: () => import('./locales/ru/reports.json'),
    notifications: () => import('./locales/ru/notifications.json'),
    settings: () => import('./locales/ru/settings.json'),
  },
};

async function loadNamespaces(locale: Locale): Promise<AbstractIntlMessages> {
  const entries = await Promise.all(
    ALL_NAMESPACES.map(async (ns) => [ns, (await LOADERS[locale][ns]()).default] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * Deep-merges the chosen locale over English. A key that has not been
 * translated yet therefore renders as readable English rather than as a raw
 * key — the translation-coverage test is what stops that reaching a release.
 */
function mergeDeep(base: AbstractIntlMessages, override: AbstractIntlMessages): AbstractIntlMessages {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeDeep(existing as AbstractIntlMessages, value as AbstractIntlMessages)
        : value;
  }
  return out as AbstractIntlMessages;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getMessages(locale: Locale): Promise<AbstractIntlMessages> {
  const translated = await loadNamespaces(locale);
  if (locale === FALLBACK_LOCALE) return translated;
  return mergeDeep(await loadNamespaces(FALLBACK_LOCALE), translated);
}
