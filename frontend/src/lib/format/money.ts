import { INTL_LOCALES, type Locale } from '@/i18n/config';

/**
 * The gym's currency and how many decimals it keeps.
 *
 * The backend stores and returns money as exact decimal strings and is
 * currency-agnostic — it never says which currency the numbers are in. The
 * display currency is therefore configuration, not data. See the integration
 * notes in the README.
 */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'UZS';
export const CURRENCY_DECIMALS = Number(process.env.NEXT_PUBLIC_CURRENCY_DECIMALS ?? 2);

/**
 * Formats an amount the backend sent as a decimal string.
 *
 * The string is handed to Intl untouched. Parsing it into a JavaScript number
 * first would be fine for a gym's sums today and quietly wrong the day one
 * exceeds 2^53 — and money is not a place to rely on "quietly wrong later".
 */
export function formatMoney(
  amount: string | number | null | undefined,
  locale: Locale,
  options: { currency?: string; decimals?: number; signDisplay?: 'auto' | 'always' | 'never' } = {},
): string {
  if (amount === null || amount === undefined || amount === '') return '—';

  const decimals = options.decimals ?? CURRENCY_DECIMALS;
  const formatter = new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'currency',
    currency: options.currency ?? CURRENCY,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: options.signDisplay ?? 'auto',
  });

  return formatter.format(normalise(amount));
}

/** The same number without a currency symbol — for inputs and table columns. */
export function formatAmount(
  amount: string | number | null | undefined,
  locale: Locale,
  decimals = CURRENCY_DECIMALS,
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(normalise(amount));
}

/**
 * `Intl.NumberFormat#format` accepts a string and formats it exactly, with no
 * float step in between. Older runtimes do not, so fall back to a number
 * there rather than throwing.
 */
type Formattable = Parameters<Intl.NumberFormat['format']>[0];

function normalise(amount: string | number): Formattable {
  if (typeof amount === 'number') return amount;
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return SUPPORTS_STRING_FORMAT ? (trimmed as Formattable) : Number(trimmed);
}

const SUPPORTS_STRING_FORMAT = (() => {
  try {
    return new Intl.NumberFormat('en').format('1.5' as unknown as Formattable) === '1.5';
  } catch {
    return false;
  }
})();

/** True when the amount is greater than zero, read from the string. */
export function isPositiveAmount(amount: string | number | null | undefined): boolean {
  if (amount === null || amount === undefined || amount === '') return false;
  return Number(amount) > 0;
}

export function isNegativeAmount(amount: string | number | null | undefined): boolean {
  if (amount === null || amount === undefined || amount === '') return false;
  return Number(amount) < 0;
}

/** Adds decimal strings without going through a float. Used for display totals only. */
export function addAmounts(...amounts: Array<string | number | null | undefined>): string {
  const scale = 10 ** CURRENCY_DECIMALS;
  let total = 0;
  for (const amount of amounts) {
    if (amount === null || amount === undefined || amount === '') continue;
    total += Math.round(Number(amount) * scale);
  }
  return (total / scale).toFixed(CURRENCY_DECIMALS);
}
