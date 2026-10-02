import { MembershipStatus } from '@prisma/client';
import {
  addDays,
  computeEndDate,
  daysBetween,
  daysRemaining,
  defaultRenewalStart,
  durationInDays,
  frozenDaysBetween,
  isTerminal,
  periodsOverlap,
  resolveStatus,
  toDateOnly,
  todayUtc,
  visitsRemaining,
} from './membership-period';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('date helpers', () => {
  it('strips the time part in UTC', () => {
    expect(toDateOnly(new Date('2026-03-15T23:45:12.345Z')).toISOString()).toBe(
      '2026-03-15T00:00:00.000Z',
    );
  });

  it('treats a late-evening UTC instant as the same day', () => {
    expect(todayUtc(new Date('2026-03-15T23:59:59.999Z')).toISOString()).toBe(
      '2026-03-15T00:00:00.000Z',
    );
  });

  it('adds days across a month boundary', () => {
    expect(addDays(d('2026-01-30'), 3).toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });

  it('adds days across a leap day', () => {
    expect(addDays(d('2028-02-28'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('counts days between dates, signed', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-01-31'))).toBe(30);
    expect(daysBetween(d('2026-01-31'), d('2026-01-01'))).toBe(-30);
    expect(daysBetween(d('2026-01-01'), d('2026-01-01'))).toBe(0);
  });

  it('survives a daylight-saving transition', () => {
    // Europe/London springs forward on 2026-03-29.
    expect(daysBetween(d('2026-03-28'), d('2026-03-30'))).toBe(2);
  });
});

describe('computeEndDate', () => {
  it('counts the start day, so a 30-day plan from the 1st ends on the 30th', () => {
    expect(computeEndDate(d('2026-01-01'), 30).toISOString()).toBe('2026-01-30T00:00:00.000Z');
  });

  it('makes a one-day plan start and end on the same day', () => {
    expect(computeEndDate(d('2026-01-01'), 1).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles a year', () => {
    expect(computeEndDate(d('2026-01-01'), 365).toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('round-trips with durationInDays', () => {
    for (const days of [1, 7, 30, 90, 365]) {
      expect(durationInDays(d('2026-01-01'), computeEndDate(d('2026-01-01'), days))).toBe(days);
    }
  });
});

describe('resolveStatus', () => {
  const period = (
    start: string,
    end: string,
    status: MembershipStatus = MembershipStatus.ACTIVE,
  ) => ({
    status,
    startDate: d(start),
    endDate: d(end),
  });

  it('is ACTIVE inside the window', () => {
    expect(resolveStatus(period('2026-01-01', '2026-01-31'), d('2026-01-15'))).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('is ACTIVE on the first day', () => {
    expect(resolveStatus(period('2026-01-01', '2026-01-31'), d('2026-01-01'))).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('is ACTIVE on the last day', () => {
    expect(resolveStatus(period('2026-01-01', '2026-01-31'), d('2026-01-31'))).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('is EXPIRED the day after the end date', () => {
    expect(resolveStatus(period('2026-01-01', '2026-01-31'), d('2026-02-01'))).toBe(
      MembershipStatus.EXPIRED,
    );
  });

  it('is PENDING before the start date', () => {
    expect(resolveStatus(period('2026-02-01', '2026-02-28'), d('2026-01-20'))).toBe(
      MembershipStatus.PENDING,
    );
  });

  it('keeps CANCELLED whatever the dates say', () => {
    expect(
      resolveStatus(
        period('2026-01-01', '2026-12-31', MembershipStatus.CANCELLED),
        d('2026-06-01'),
      ),
    ).toBe(MembershipStatus.CANCELLED);
  });

  it('does not let a frozen membership expire underneath the member', () => {
    expect(
      resolveStatus(period('2026-01-01', '2026-01-31', MembershipStatus.FROZEN), d('2026-06-01')),
    ).toBe(MembershipStatus.FROZEN);
  });

  it('never revives an EXPIRED membership on its own', () => {
    // Terminal statuses hold. Reviving is an explicit administrator action
    // (extend), which seeds this function with ACTIVE instead.
    expect(
      resolveStatus(period('2026-01-01', '2026-03-31', MembershipStatus.EXPIRED), d('2026-02-15')),
    ).toBe(MembershipStatus.EXPIRED);
  });

  it('derives ACTIVE when seeded with a non-terminal status', () => {
    expect(
      resolveStatus(period('2026-01-01', '2026-03-31', MembershipStatus.ACTIVE), d('2026-02-15')),
    ).toBe(MembershipStatus.ACTIVE);
  });

  it('does not revive a membership force-expired on its own last day', () => {
    // The regression this guards: endDate === today, so a date-only rule would
    // have called it ACTIVE again on the next sweep.
    expect(
      resolveStatus(period('2026-01-01', '2026-01-31', MembershipStatus.EXPIRED), d('2026-01-31')),
    ).toBe(MembershipStatus.EXPIRED);
  });
});

describe('isTerminal', () => {
  it.each([
    [MembershipStatus.EXPIRED, true],
    [MembershipStatus.CANCELLED, true],
    [MembershipStatus.ACTIVE, false],
    [MembershipStatus.PENDING, false],
    [MembershipStatus.FROZEN, false],
  ])('%s -> %s', (status, expected) => {
    expect(isTerminal(status)).toBe(expected);
  });
});

describe('daysRemaining', () => {
  const period = (end: string, status: MembershipStatus = MembershipStatus.ACTIVE) => ({
    status,
    startDate: d('2026-01-01'),
    endDate: d(end),
  });

  it('counts today as a remaining day', () => {
    expect(daysRemaining(period('2026-01-31'), d('2026-01-31'))).toBe(1);
  });

  it('counts the full window on the first day', () => {
    expect(daysRemaining(period('2026-01-30'), d('2026-01-01'))).toBe(30);
  });

  it('is zero once expired, never negative', () => {
    expect(daysRemaining(period('2026-01-31'), d('2026-03-01'))).toBe(0);
  });

  it('is null while frozen, because the clock is stopped', () => {
    expect(
      daysRemaining(period('2026-01-31', MembershipStatus.FROZEN), d('2026-01-15')),
    ).toBeNull();
  });

  it('is zero once cancelled', () => {
    expect(daysRemaining(period('2026-12-31', MembershipStatus.CANCELLED), d('2026-01-15'))).toBe(
      0,
    );
  });
});

describe('visitsRemaining', () => {
  it('is null for an unlimited plan', () => {
    expect(visitsRemaining(null, 42)).toBeNull();
  });

  it('subtracts used visits', () => {
    expect(visitsRemaining(10, 3)).toBe(7);
  });

  it('is zero when exhausted', () => {
    expect(visitsRemaining(10, 10)).toBe(0);
  });

  it('never goes negative', () => {
    expect(visitsRemaining(10, 12)).toBe(0);
  });
});

describe('frozenDaysBetween', () => {
  it('credits nothing for a same-day freeze and unfreeze', () => {
    expect(frozenDaysBetween(d('2026-01-10'), d('2026-01-10'))).toBe(0);
  });

  it('credits whole days paused', () => {
    expect(frozenDaysBetween(d('2026-01-10'), d('2026-01-13'))).toBe(3);
  });

  it('never credits negative days', () => {
    expect(frozenDaysBetween(d('2026-01-13'), d('2026-01-10'))).toBe(0);
  });
});

describe('defaultRenewalStart', () => {
  it('starts the day after a membership that is still running', () => {
    expect(defaultRenewalStart(d('2026-01-31'), d('2026-01-15')).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('starts today when the previous membership already lapsed', () => {
    expect(defaultRenewalStart(d('2025-12-31'), d('2026-03-10')).toISOString()).toBe(
      '2026-03-10T00:00:00.000Z',
    );
  });

  it('starts tomorrow when the previous membership ends today', () => {
    expect(defaultRenewalStart(d('2026-03-10'), d('2026-03-10')).toISOString()).toBe(
      '2026-03-11T00:00:00.000Z',
    );
  });
});

describe('periodsOverlap', () => {
  it('detects a contained period', () => {
    expect(periodsOverlap(d('2026-01-01'), d('2026-01-31'), d('2026-01-10'), d('2026-01-20'))).toBe(
      true,
    );
  });

  it('detects a single shared day', () => {
    expect(periodsOverlap(d('2026-01-01'), d('2026-01-31'), d('2026-01-31'), d('2026-02-15'))).toBe(
      true,
    );
  });

  it('treats back-to-back periods as not overlapping', () => {
    expect(periodsOverlap(d('2026-01-01'), d('2026-01-31'), d('2026-02-01'), d('2026-02-28'))).toBe(
      false,
    );
  });

  it('is symmetric', () => {
    const a: [Date, Date] = [d('2026-01-01'), d('2026-01-31')];
    const b: [Date, Date] = [d('2026-01-15'), d('2026-02-15')];
    expect(periodsOverlap(...a, ...b)).toBe(periodsOverlap(...b, ...a));
  });
});
