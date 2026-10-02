import { TrainingSessionStatus } from '@prisma/client';

/**
 * Scheduling rules for personal training sessions.
 *
 * Kept pure so the overlap rule — the one that stops a trainer being
 * double-booked — can be tested against boundaries directly.
 */

/** Statuses that still occupy the calendar. A cancelled slot is free again. */
export const BLOCKING_STATUSES: readonly TrainingSessionStatus[] = [
  TrainingSessionStatus.SCHEDULED,
  TrainingSessionStatus.COMPLETED,
];

/** Statuses from which no further transition is possible. */
export const TERMINAL_SESSION_STATUSES: readonly TrainingSessionStatus[] = [
  TrainingSessionStatus.COMPLETED,
  TrainingSessionStatus.CANCELLED,
  TrainingSessionStatus.NO_SHOW,
];

export function isSessionTerminal(status: TrainingSessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 8 * 60;

/**
 * Two half-open intervals overlap when each starts before the other ends.
 *
 * Half-open is what makes back-to-back sessions work: a 09:00–10:00 slot and a
 * 10:00–11:00 slot do not clash.
 */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export type SessionWindowProblem = 'END_NOT_AFTER_START' | 'TOO_SHORT' | 'TOO_LONG';

/** Validates the shape of a session window, independent of other bookings. */
export function validateSessionWindow(startsAt: Date, endsAt: Date): SessionWindowProblem | null {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;

  if (minutes <= 0) return 'END_NOT_AFTER_START';
  if (minutes < MIN_SESSION_MINUTES) return 'TOO_SHORT';
  if (minutes > MAX_SESSION_MINUTES) return 'TOO_LONG';

  return null;
}

export const SESSION_WINDOW_MESSAGES: Record<SessionWindowProblem, string> = {
  END_NOT_AFTER_START: 'endsAt must be after startsAt',
  TOO_SHORT: `A session must last at least ${MIN_SESSION_MINUTES} minutes`,
  TOO_LONG: `A session must not last longer than ${MAX_SESSION_MINUTES / 60} hours`,
};

export function sessionDurationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}
