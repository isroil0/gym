import { Prisma } from '@prisma/client';
import { ZERO, atLeastZero, money, sum, type Money } from '../../common/money/money';

/**
 * Pure arithmetic for what a member owes.
 *
 * Kept free of Prisma queries so every rule below — partial payments, refunds
 * clawing a debt back, discounts, overpayment — can be tested directly.
 */

/** How settled a charge is. */
export enum SettlementStatus {
  /** Nothing has been paid. */
  UNPAID = 'UNPAID',
  /** Some but not all of the amount owed has been paid. */
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  /** Settled exactly. */
  PAID = 'PAID',
  /** More was taken than was owed; the excess is a credit. */
  OVERPAID = 'OVERPAID',
}

export interface ChargeInput {
  /** The agreed price. */
  purchasePrice: Prisma.Decimal | number | string;
  /** Reduction granted off that price. */
  discountAmount?: Prisma.Decimal | number | string;
  /** Gross amounts received against this charge. */
  payments?: Array<Prisma.Decimal | number | string>;
  /** Amounts returned against those payments. */
  refunds?: Array<Prisma.Decimal | number | string>;
}

export interface ChargeSettlement {
  /** Price before any discount. */
  grossAmount: Money;
  discountAmount: Money;
  /** What is actually owed: gross less discount, never below nil. */
  amountDue: Money;
  /** Gross received. */
  amountPaid: Money;
  amountRefunded: Money;
  /** Received less returned — what the gym has actually kept. */
  netPaid: Money;
  /** Due less net paid. Negative means the member is in credit. */
  balance: Money;
  /** The debt, clamped at nil so a credit never reads as negative debt. */
  outstanding: Money;
  /** Credit held, i.e. the overpayment. Zero unless balance is negative. */
  credit: Money;
  status: SettlementStatus;
}

export function settleCharge(input: ChargeInput): ChargeSettlement {
  const grossAmount = money(input.purchasePrice);
  const discountAmount = money(input.discountAmount ?? 0);

  // A discount larger than the price cannot create a liability for the gym.
  const amountDue = atLeastZero(grossAmount.minus(discountAmount));

  const amountPaid = sum(input.payments ?? []);
  const amountRefunded = sum(input.refunds ?? []);
  const netPaid = amountPaid.minus(amountRefunded);

  const balance = amountDue.minus(netPaid);

  return {
    grossAmount,
    discountAmount,
    amountDue,
    amountPaid,
    amountRefunded,
    netPaid,
    balance,
    outstanding: atLeastZero(balance),
    credit: atLeastZero(balance.negated()),
    status: settlementStatus(amountDue, netPaid),
  };
}

export function settlementStatus(amountDue: Money, netPaid: Money): SettlementStatus {
  if (netPaid.greaterThan(amountDue)) return SettlementStatus.OVERPAID;
  if (netPaid.equals(amountDue)) {
    // A fully discounted charge with nothing paid is settled, not unpaid.
    return SettlementStatus.PAID;
  }
  if (netPaid.lessThanOrEqualTo(ZERO)) return SettlementStatus.UNPAID;
  return SettlementStatus.PARTIALLY_PAID;
}

/**
 * How much of a payment may still be returned. Refunding more than was taken
 * would manufacture money, so this is the hard ceiling.
 */
export function refundableAmount(
  paymentAmount: Prisma.Decimal | number | string,
  alreadyRefunded: Array<Prisma.Decimal | number | string>,
): Money {
  return atLeastZero(money(paymentAmount).minus(sum(alreadyRefunded)));
}

/** Aggregates per-charge settlements into one member-level position. */
export function aggregateSettlements(settlements: ChargeSettlement[]): {
  amountDue: Money;
  amountPaid: Money;
  amountRefunded: Money;
  netPaid: Money;
  balance: Money;
  outstanding: Money;
  credit: Money;
} {
  const amountDue = sum(settlements.map((s) => s.amountDue));
  const amountPaid = sum(settlements.map((s) => s.amountPaid));
  const amountRefunded = sum(settlements.map((s) => s.amountRefunded));
  const netPaid = amountPaid.minus(amountRefunded);
  const balance = amountDue.minus(netPaid);

  return {
    amountDue,
    amountPaid,
    amountRefunded,
    netPaid,
    balance,
    outstanding: atLeastZero(balance),
    credit: atLeastZero(balance.negated()),
  };
}

/**
 * Revenue and profit.
 *
 * A refund is contra-revenue, not an operating cost: it reduces what the gym
 * earned rather than adding to what it spent. Cash out is therefore
 * `expenses + refunds`, while profit is `(income - refunds) - expenses`.
 */
export interface LedgerTotalsInput {
  income: Prisma.Decimal | number | string;
  refunds: Prisma.Decimal | number | string;
  expenses: Prisma.Decimal | number | string;
}

export interface LedgerTotals {
  income: Money;
  refunds: Money;
  /** Income net of refunds. */
  revenue: Money;
  expenses: Money;
  profit: Money;
}

export function computeTotals(input: LedgerTotalsInput): LedgerTotals {
  const income = money(input.income);
  const refunds = money(input.refunds);
  const expenses = money(input.expenses);
  const revenue = income.minus(refunds);

  return { income, refunds, revenue, expenses, profit: revenue.minus(expenses) };
}
