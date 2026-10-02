import { INTL_LOCALES, type Locale } from '@/i18n/config';

export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(INTL_LOCALES[locale], options).format(numeric);
}

export function formatPercent(
  value: number | string | null | undefined,
  locale: Locale,
  decimals = 1,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  // The backend sends percentages already scaled (12.5 means 12.5%), so divide
  // before handing them to a formatter that expects a fraction.
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numeric / 100);
}

/** "1.2k", "3.4M" — for chart axes and dense cards, never for exact money. */
export function formatCompact(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMeasurement(
  value: number | string | null | undefined,
  locale: Locale,
  unit: string,
  decimals = 1,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const formatted = new Intl.NumberFormat(INTL_LOCALES[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(numeric);
  return `${formatted} ${unit}`;
}
