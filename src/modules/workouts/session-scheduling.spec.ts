import { TrainingSessionStatus } from '@prisma/client';
import {
  BLOCKING_STATUSES,
  MAX_SESSION_MINUTES,
  SESSION_WINDOW_MESSAGES,
  intervalsOverlap,
  isSessionTerminal,
  sessionDurationMinutes,
  validateSessionWindow,
} from './session-scheduling';

const t = (iso: string) => new Date(`2026-10-01T${iso}:00.000Z`);

describe('intervalsOverlap', () => {
  it('detects a fully contained session', () => {
    expect(intervalsOverlap(t('09:00'), t('11:00'), t('09:30'), t('10:00'))).toBe(true);
  });

  it('detects a partial overlap at the start', () => {
    expect(intervalsOverlap(t('09:00'), t('10:00'), t('08:30'), t('09:30'))).toBe(true);
  });

  it('detects a partial overlap at the end', () => {
    expect(intervalsOverlap(t('09:00'), t('10:00'), t('09:30'), t('10:30'))).toBe(true);
  });

  it('treats back-to-back sessions as free, not clashing', () => {
    // 09:00-10:00 then 10:00-11:00 is a normal trainer's morning.
    expect(intervalsOverlap(t('09:00'), t('10:00'), t('10:00'), t('11:00'))).toBe(false);
  });

  it('treats a session ending exactly when another starts as free, either way round', () => {
    expect(intervalsOverlap(t('10:00'), t('11:00'), t('09:00'), t('10:00'))).toBe(false);
  });

  it('detects an exact duplicate', () => {
    expect(intervalsOverlap(t('09:00'), t('10:00'), t('09:00'), t('10:00'))).toBe(true);
  });

  it('reports no overlap for separated sessions', () => {
    expect(intervalsOverlap(t('09:00'), t('10:00'), t('14:00'), t('15:00'))).toBe(false);
  });

  it('is symmetric', () => {
    const a: [Date, Date] = [t('09:00'), t('10:30')];
    const b: [Date, Date] = [t('10:00'), t('11:00')];

    expect(intervalsOverlap(...a, ...b)).toBe(intervalsOverlap(...b, ...a));
  });

  it('detects a one-minute overlap', () => {
    expect(intervalsOverlap(t('09:00'), t('10:01'), t('10:00'), t('11:00'))).toBe(true);
  });
});

describe('validateSessionWindow', () => {
  it('accepts a normal hour-long session', () => {
    expect(validateSessionWindow(t('09:00'), t('10:00'))).toBeNull();
  });

  it('rejects an end before the start', () => {
    expect(validateSessionWindow(t('10:00'), t('09:00'))).toBe('END_NOT_AFTER_START');
  });

  it('rejects a zero-length session', () => {
    expect(validateSessionWindow(t('09:00'), t('09:00'))).toBe('END_NOT_AFTER_START');
  });

  it('rejects an implausibly short session', () => {
    expect(validateSessionWindow(t('09:00'), t('09:02'))).toBe('TOO_SHORT');
  });

  it('accepts exactly the minimum length', () => {
    expect(validateSessionWindow(t('09:00'), t('09:05'))).toBeNull();
  });

  it('rejects a session longer than the maximum', () => {
    const start = t('06:00');
    const end = new Date(start.getTime() + (MAX_SESSION_MINUTES + 1) * 60_000);

    expect(validateSessionWindow(start, end)).toBe('TOO_LONG');
  });

  it('accepts exactly the maximum length', () => {
    const start = t('06:00');
    const end = new Date(start.getTime() + MAX_SESSION_MINUTES * 60_000);

    expect(validateSessionWindow(start, end)).toBeNull();
  });

  it('has a message for every problem', () => {
    for (const problem of ['END_NOT_AFTER_START', 'TOO_SHORT', 'TOO_LONG'] as const) {
      expect(SESSION_WINDOW_MESSAGES[problem].length).toBeGreaterThan(0);
    }
  });
});

describe('sessionDurationMinutes', () => {
  it.each([
    ['09:00', '10:00', 60],
    ['09:00', '09:45', 45],
    ['09:00', '09:05', 5],
  ])('reports %s to %s as %i minutes', (start, end, expected) => {
    expect(sessionDurationMinutes(t(start), t(end))).toBe(expected);
  });
});

describe('status helpers', () => {
  it('counts only scheduled and completed sessions as occupying the calendar', () => {
    expect(BLOCKING_STATUSES).toContain(TrainingSessionStatus.SCHEDULED);
    expect(BLOCKING_STATUSES).toContain(TrainingSessionStatus.COMPLETED);
    // A cancelled slot frees the time; a no-show still consumed it, but the
    // trainer is free to rebook, so neither blocks.
    expect(BLOCKING_STATUSES).not.toContain(TrainingSessionStatus.CANCELLED);
    expect(BLOCKING_STATUSES).not.toContain(TrainingSessionStatus.NO_SHOW);
  });

  it.each([
    [TrainingSessionStatus.SCHEDULED, false],
    [TrainingSessionStatus.COMPLETED, true],
    [TrainingSessionStatus.CANCELLED, true],
    [TrainingSessionStatus.NO_SHOW, true],
  ])('treats %s as terminal: %s', (status, expected) => {
    expect(isSessionTerminal(status)).toBe(expected);
  });
});
