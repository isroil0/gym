import { MembershipStatus } from '@prisma/client';

/**
 * Pure date and status arithmetic for memberships.
 *
 * Everything here works in **UTC date-only** terms. Membership start and end
 * dates are stored as SQL `date` columns, which Prisma hands back as UTC
 * midnight; doing the maths in local time would shift a membership by a day
 * for anyone west of Greenwich.
 */

export const MS_PER_DAY = 86_400_000;

/** Strips the time part, in UTC. */
export function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function todayUtc(now: Date = new Date()): Date {
  return toDateOnly(now);
}

export function addDays(date: Date, days: number): Date {
  return new Date(toDateOnly(date).getTime() + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / MS_PER_DAY);
}

/**
 * The inclusive last day of a membership: a 30-day plan starting on the 1st
 * ends on the 30th, not the 31st.
 */
export function computeEndDate(startDate: Date, durationDays: number): Date {
  return addDays(startDate, durationDays - 1);
}

/** Inclusive length of a period in days. */
export function durationInDays(startDate: Date, endDate: Date): number {
  return daysBetween(startDate, endDate) + 1;
}

/** The subset of a membership this module needs in order to reason about it. */
export interface MembershipPeriod {
  status: MembershipStatus;
  startDate: Date;
  endDate: Date;
}

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly MembershipStatus[] = [
  MembershipStatus.EXPIRED,
  MembershipStatus.CANCELLED,
];

export function isTerminal(status: MembershipStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * What the status *should* be, given today's date.
 *
 * Terminal statuses hold: an EXPIRED or CANCELLED membership is never revived
 * automatically — only a deliberate administrator action (an extension) brings
 * one back, by seeding this function with a non-terminal status. Without that,
 * force-expiring a membership on its own last day would be undone by the next
 * status sweep.
 *
 * FROZEN also holds — a paused membership must not expire underneath the
 * member. Everything else is derived from the dates.
 */
export function resolveStatus(
  membership: MembershipPeriod,
  now: Date = new Date(),
): MembershipStatus {
  if (isTerminal(membership.status)) return membership.status;
  if (membership.status === MembershipStatus.FROZEN) return MembershipStatus.FROZEN;

  const today = todayUtc(now);

  if (daysBetween(membership.endDate, today) > 0) return MembershipStatus.EXPIRED;
  if (daysBetween(today, membership.startDate) > 0) return MembershipStatus.PENDING;

  return MembershipStatus.ACTIVE;
}

/** Statuses that occupy a member's calendar and so must not overlap. */
export const OCCUPYING_STATUSES: readonly MembershipStatus[] = [
  MembershipStatus.PENDING,
  MembershipStatus.ACTIVE,
  MembershipStatus.FROZEN,
];

/**
 * Days left before the membership lapses, counting today. Zero once it has
 * ended; null while frozen, where the clock is not running.
 */
export function daysRemaining(membership: MembershipPeriod, now: Date = new Date()): number | null {
  if (membership.status === MembershipStatus.FROZEN) return null;
  if (membership.status === MembershipStatus.CANCELLED) return 0;

  const remaining = daysBetween(todayUtc(now), membership.endDate) + 1;
  return Math.max(0, remaining);
}

/** Remaining visits, or null when the plan is unlimited. */
export function visitsRemaining(visitLimit: number | null, visitsUsed: number): number | null {
  if (visitLimit === null) return null;
  return Math.max(0, visitLimit - visitsUsed);
}

/**
 * Days to credit back when a freeze ends. Freezing and unfreezing on the same
 * day costs nothing; the clock only stops for whole days.
 */
export function frozenDaysBetween(frozenAt: Date, resumedAt: Date): number {
  return Math.max(0, daysBetween(frozenAt, resumedAt));
}

/**
 * Where a renewal should start: the day after the current membership ends,
 * or today when that membership already lapsed (no retroactive coverage).
 */
export function defaultRenewalStart(previousEndDate: Date, now: Date = new Date()): Date {
  const dayAfter = addDays(previousEndDate, 1);
  const today = todayUtc(now);
  return daysBetween(today, dayAfter) > 0 ? dayAfter : today;
}

/** Two inclusive date ranges overlap when neither finishes before the other starts. */
export function periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return daysBetween(aStart, bEnd) >= 0 && daysBetween(bStart, aEnd) >= 0;
}
