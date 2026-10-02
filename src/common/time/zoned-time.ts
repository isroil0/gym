/**
 * Timezone-aware day and month boundaries.
 *
 * A gym's day does not start at UTC midnight. If boundaries are computed in UTC
 * for a gym in New York, a payment taken at 20:00 on the last day of the month
 * lands in the next month's revenue — a real accounting error, not a cosmetic
 * one. Everything here converts between an instant and a *wall-clock date in a
 * named zone*, so a report period means what the gym owner thinks it means.
 *
 * Implemented on `Intl.DateTimeFormat`, which carries the IANA database and
 * therefore handles daylight saving without a dependency or a hand-maintained
 * offset table.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Cached per zone — constructing a formatter is the expensive part. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  formatters.set(timeZone, formatter);
  return formatter;
}

/** True when the runtime recognises the zone, so a bad setting can be rejected. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading in `timeZone` at a given instant. */
export function zonedPartsOf(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value ?? '0';
    // Some locales render midnight as hour 24.
    const parsed = Number.parseInt(found, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const hour = value('hour');

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: hour === 24 ? 0 : hour,
    minute: value('minute'),
    second: value('second'),
  };
}

/** The local calendar date in `timeZone`, as `YYYY-MM-DD`. */
export function zonedDateString(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedPartsOf(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function partsToUtcMillis(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * The instant at which a given wall-clock reading occurs in `timeZone`.
 *
 * Converges in two passes: guess that the wall clock is UTC, measure how far
 * the zone actually is from that guess, correct, then re-measure in case the
 * correction crossed a daylight-saving transition.
 *
 * Where a reading is ambiguous (the hour repeated when clocks go back) this
 * resolves deterministically to one of the two instants; where it does not
 * exist (the hour skipped when clocks go forward) it resolves to the instant
 * just after the jump. Both are acceptable for reporting boundaries, which is
 * all this is used for.
 */
export function zonedTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const target = partsToUtcMillis(parts);

  let guess = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = partsToUtcMillis(zonedPartsOf(new Date(guess), timeZone)) - guess;
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }

  return new Date(guess);
}

const MIDNIGHT = { hour: 0, minute: 0, second: 0 } as const;

/** Parses `YYYY-MM-DD`, rejecting anything else. */
export function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new Error(`Expected a date in the form YYYY-MM-DD, received '${value}'`);
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

export interface InstantRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive, so comparisons never need to reason about the final millisecond. */
  end: Date;
}

/** The instants spanned by one local calendar day. */
export function dayRange(localDate: string, timeZone: string): InstantRange {
  const { year, month, day } = parseLocalDate(localDate);

  return {
    start: zonedTimeToUtc({ year, month, day, ...MIDNIGHT }, timeZone),
    end: zonedTimeToUtc({ year, month, day: day + 1, ...MIDNIGHT }, timeZone),
  };
}

/** The instants spanned by an inclusive range of local calendar days. */
export function dateRangeToInstants(
  fromLocalDate: string,
  toLocalDate: string,
  timeZone: string,
): InstantRange {
  const from = parseLocalDate(fromLocalDate);
  const to = parseLocalDate(toLocalDate);

  return {
    start: zonedTimeToUtc({ ...from, ...MIDNIGHT }, timeZone),
    // The day *after* `to`, so the whole of the last day is included.
    end: zonedTimeToUtc({ ...to, day: to.day + 1, ...MIDNIGHT }, timeZone),
  };
}

/** The instants spanned by one local calendar month. */
export function monthRange(year: number, month: number, timeZone: string): InstantRange {
  return {
    start: zonedTimeToUtc({ year, month, day: 1, ...MIDNIGHT }, timeZone),
    end: zonedTimeToUtc({ year, month: month + 1, day: 1, ...MIDNIGHT }, timeZone),
  };
}

/** First and last local dates of a month, as `YYYY-MM-DD`. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** Local date `offset` days from a local date. */
export function shiftLocalDate(localDate: string, offset: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));

  return zonedDateString(shifted, 'UTC');
}
