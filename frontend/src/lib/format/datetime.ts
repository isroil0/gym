import { INTL_LOCALES, type Locale } from '@/i18n/config';

/**
 * The clock the gym runs on. Timestamps are rendered in this zone so that
 * "yesterday's check-ins" means what the front desk means by it, regardless of
 * where the person reading the screen happens to be.
 */
export const DISPLAY_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Tashkent';

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * True for a backend field that is a calendar date rather than an instant:
 * "2026-10-01" or "2026-10-01T00:00:00.000Z" for a date-only column.
 *
 * These must not be shifted into a timezone. A membership that ends on the
 * 1st ends on the 1st in Tashkent and in London alike, and converting it would
 * show the 30th of September to half the world.
 */
function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(value);
}

export function formatDate(value: DateInput, locale: Locale, style: 'short' | 'long' = 'short'): string {
  if (typeof value === 'string' && isCalendarDate(value)) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      day: style === 'long' ? 'numeric' : '2-digit',
      month: style === 'long' ? 'long' : '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year!, month! - 1, day!)));
  }

  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: style === 'long' ? 'numeric' : '2-digit',
    month: style === 'long' ? 'long' : '2-digit',
    year: 'numeric',
    timeZone: DISPLAY_TIMEZONE,
  }).format(date);
}

export function formatTime(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  }).format(date);
}

export function formatWeekday(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: 'short',
    timeZone: DISPLAY_TIMEZONE,
  }).format(date);
}

/** "3 days ago", "in 2 hours" — the unit chosen by how far away it is. */
export function formatRelative(value: DateInput, locale: Locale, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '—';

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const absolute = Math.abs(seconds);
  const relative = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], { numeric: 'auto' });

  if (absolute < 45) return relative.format(0, 'second');
  if (absolute < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (absolute < 2592000) return relative.format(Math.round(seconds / 86400), 'day');
  if (absolute < 31536000) return relative.format(Math.round(seconds / 2592000), 'month');
  return relative.format(Math.round(seconds / 31536000), 'year');
}

/** Minutes between two instants, for session and visit durations. */
export function durationMinutes(from: DateInput, to: DateInput): number | null {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatDuration(minutes: number | null, locale: Locale): string {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const number = new Intl.NumberFormat(INTL_LOCALES[locale]);
  if (hours === 0) return `${number.format(rest)} min`;
  return rest === 0
    ? `${number.format(hours)} h`
    : `${number.format(hours)} h ${number.format(rest)} min`;
}

/** The ISO calendar date (yyyy-mm-dd) for an instant, in the gym's timezone. */
export function toIsoDate(value: DateInput): string {
  const date = toDate(value) ?? new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  }).format(date);
  return parts;
}

/** Today, yesterday, first of this month — the anchors every report page needs. */
export function dateAnchors(now: Date = new Date()) {
  const today = toIsoDate(now);
  const [year, month] = today.split('-').map(Number);
  const shift = (days: number) => {
    const base = new Date(`${today}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
  };
  return {
    today,
    yesterday: shift(-1),
    last7: shift(-6),
    last30: shift(-29),
    monthStart: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    yearStart: `${String(year).padStart(4, '0')}-01-01`,
  };
}
