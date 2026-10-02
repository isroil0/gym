import { Prisma } from '@prisma/client';

/**
 * Money arithmetic.
 *
 * Every amount in the system is a `NUMERIC(10,2)` column and is handled as a
 * `Prisma.Decimal` (decimal.js) in memory — never a JavaScript number, where
 * 0.1 + 0.2 would quietly become 0.30000000000000004. Amounts cross the API
 * boundary as fixed two-decimal strings for the same reason.
 */

export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

export function money(value: Prisma.Decimal | number | string): Money {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function sum(values: Array<Prisma.Decimal | number | string>): Money {
  return values.reduce<Money>((total, value) => total.plus(money(value)), ZERO);
}

/** Two-decimal string, the only form amounts take in API responses. */
export function format(value: Prisma.Decimal | number | string): string {
  return money(value).toFixed(2);
}

/** Rounds to whole cents, half away from zero — the convention for receipts. */
export function round2(value: Prisma.Decimal | number | string): Money {
  return money(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function isZero(value: Money): boolean {
  return value.isZero();
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(ZERO);
}

export function isNegative(value: Money): boolean {
  return value.lessThan(ZERO);
}

/** Clamps a negative amount to zero. Used wherever a debt must not go below nil. */
export function atLeastZero(value: Money): Money {
  return isNegative(value) ? ZERO : value;
}

/** `percent` is expressed 0-100. */
export function percentOf(
  value: Prisma.Decimal | number | string,
  percent: Prisma.Decimal | number | string,
): Money {
  return round2(money(value).times(money(percent)).dividedBy(100));
}
