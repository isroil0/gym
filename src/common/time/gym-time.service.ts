import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  dateRangeToInstants,
  dayRange,
  isValidTimeZone,
  monthBounds,
  monthRange,
  parseLocalDate,
  shiftLocalDate,
  zonedDateString,
  zonedPartsOf,
  zonedTimeToUtc,
  type InstantRange,
} from './zoned-time';

/** The settings key holding the gym's operating timezone. */
export const GYM_TIMEZONE_KEY = 'gym.timezone';
const FALLBACK_TIMEZONE = 'UTC';

/**
 * The gym's notion of "today", "this month" and "between these two dates".
 *
 * Reporting periods are the gym's local calendar, read from the
 * `gym.timezone` setting. Caching it avoids a settings lookup on every
 * aggregate query; `refresh()` picks up a change without a restart.
 */
@Injectable()
export class GymTimeService implements OnModuleInit {
  private readonly logger = new Logger(GymTimeService.name);
  private timeZone = FALLBACK_TIMEZONE;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Re-reads the setting. Call after changing it. */
  async refresh(): Promise<string> {
    const setting = await this.prisma.appSetting
      .findUnique({ where: { key: GYM_TIMEZONE_KEY } })
      .catch(() => null);

    const configured = setting?.value?.trim();

    if (!configured) {
      this.timeZone = FALLBACK_TIMEZONE;
      return this.timeZone;
    }

    if (!isValidTimeZone(configured)) {
      // Falling back is safer than refusing to serve reports; a wrong zone
      // skews figures, an unhandled error hides them entirely.
      this.logger.warn(
        `Setting '${GYM_TIMEZONE_KEY}' is '${configured}', which is not a known IANA timezone. Falling back to ${FALLBACK_TIMEZONE}.`,
      );
      this.timeZone = FALLBACK_TIMEZONE;
      return this.timeZone;
    }

    if (configured !== this.timeZone) {
      this.logger.log(`Reporting timezone set to ${configured}`);
    }

    this.timeZone = configured;
    return this.timeZone;
  }

  get zone(): string {
    return this.timeZone;
  }

  /** The gym's current local date, as `YYYY-MM-DD`. */
  today(now: Date = new Date()): string {
    return zonedDateString(now, this.timeZone);
  }

  /** The local date an instant falls on, for bucketing a timestamp column. */
  localDateOf(instant: Date): string {
    return zonedDateString(instant, this.timeZone);
  }

  /** The local year and month an instant falls in. */
  localMonthOf(instant: Date = new Date()): { year: number; month: number } {
    const { year, month } = zonedPartsOf(instant, this.timeZone);
    return { year, month };
  }

  /** Instants spanning one local day. */
  day(localDate: string): InstantRange {
    return dayRange(localDate, this.timeZone);
  }

  /** Instants spanning an inclusive range of local days. */
  range(fromLocalDate: string, toLocalDate: string): InstantRange {
    return dateRangeToInstants(fromLocalDate, toLocalDate, this.timeZone);
  }

  /** Instants spanning one local calendar month. */
  month(year: number, monthNumber: number): InstantRange {
    return monthRange(year, monthNumber, this.timeZone);
  }

  /** First and last local dates of a month. */
  monthDates(year: number, monthNumber: number): { from: string; to: string } {
    return monthBounds(year, monthNumber);
  }

  /** The local month containing `now`, as a date range. */
  currentMonthDates(now: Date = new Date()): { from: string; to: string } {
    const { year, month } = this.localMonthOf(now);
    return this.monthDates(year, month);
  }

  shift(localDate: string, days: number): string {
    return shiftLocalDate(localDate, days);
  }

  /**
   * The instant of a wall-clock time on a given local date.
   *
   * Goes through the zone conversion rather than adding hours to midnight, so
   * a day on which the clocks changed still lands on the right instant.
   */
  localTimeInstant(localDate: string, hour: number, minute = 0): Date {
    const { year, month, day } = parseLocalDate(localDate);
    return zonedTimeToUtc({ year, month, day, hour, minute, second: 0 }, this.timeZone);
  }

  /**
   * A local date as a UTC-midnight `Date`, for comparing against a SQL `date`
   * column. Those columns hold a calendar date with no zone, so they must be
   * compared to a date, never to a zoned instant.
   */
  localDateAsUtcMidnight(localDate: string): Date {
    return new Date(`${localDate}T00:00:00.000Z`);
  }
}
