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
} from './zoned-time';

const NY = 'America/New_York';
const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';
const KATHMANDU = 'Asia/Kathmandu'; // UTC+05:45 — a non-hour offset.

describe('isValidTimeZone', () => {
  it.each(['UTC', NY, LONDON, TOKYO])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['Mars/Olympus', 'not a zone', ''])('rejects %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('zonedPartsOf', () => {
  it('reads the wall clock in the zone, not UTC', () => {
    // 2026-07-01 12:00 UTC is 08:00 in New York (EDT, UTC-4).
    expect(zonedPartsOf(new Date('2026-07-01T12:00:00.000Z'), NY)).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 8,
      minute: 0,
      second: 0,
    });
  });

  it('renders midnight as hour 0, not 24', () => {
    expect(zonedPartsOf(new Date('2026-07-01T00:00:00.000Z'), 'UTC').hour).toBe(0);
  });

  it('crosses the date line correctly', () => {
    // 23:00 UTC is already the next day in Tokyo (UTC+9).
    expect(zonedPartsOf(new Date('2026-07-01T23:00:00.000Z'), TOKYO)).toEqual(
      expect.objectContaining({ year: 2026, month: 7, day: 2, hour: 8 }),
    );
  });

  it('handles a zone behind UTC rolling back a day', () => {
    // 02:00 UTC is still the previous evening in New York.
    expect(zonedPartsOf(new Date('2026-07-02T02:00:00.000Z'), NY)).toEqual(
      expect.objectContaining({ day: 1, hour: 22 }),
    );
  });

  it('handles a 45-minute offset', () => {
    expect(zonedPartsOf(new Date('2026-07-01T00:00:00.000Z'), KATHMANDU)).toEqual(
      expect.objectContaining({ day: 1, hour: 5, minute: 45 }),
    );
  });
});

describe('zonedDateString', () => {
  it('reports the local calendar date', () => {
    expect(zonedDateString(new Date('2026-07-02T02:00:00.000Z'), NY)).toBe('2026-07-01');
    expect(zonedDateString(new Date('2026-07-02T02:00:00.000Z'), 'UTC')).toBe('2026-07-02');
    expect(zonedDateString(new Date('2026-07-01T23:00:00.000Z'), TOKYO)).toBe('2026-07-02');
  });

  it('zero-pads single-digit months and days', () => {
    expect(zonedDateString(new Date('2026-01-05T12:00:00.000Z'), 'UTC')).toBe('2026-01-05');
  });
});

describe('zonedTimeToUtc', () => {
  const midnight = (year: number, month: number, day: number) => ({
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
  });

  it('is the identity for UTC', () => {
    expect(zonedTimeToUtc(midnight(2026, 7, 1), 'UTC').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('resolves local midnight in a zone behind UTC', () => {
    // Midnight in New York on 1 July (EDT, UTC-4) is 04:00 UTC.
    expect(zonedTimeToUtc(midnight(2026, 7, 1), NY).toISOString()).toBe('2026-07-01T04:00:00.000Z');
  });

  it('resolves local midnight in a zone ahead of UTC', () => {
    // Midnight in Tokyo is 15:00 UTC the previous day.
    expect(zonedTimeToUtc(midnight(2026, 7, 1), TOKYO).toISOString()).toBe(
      '2026-06-30T15:00:00.000Z',
    );
  });

  it('accounts for winter time as well as summer time', () => {
    // January in New York is EST (UTC-5), not EDT.
    expect(zonedTimeToUtc(midnight(2026, 1, 15), NY).toISOString()).toBe(
      '2026-01-15T05:00:00.000Z',
    );
  });

  it('round-trips through zonedPartsOf', () => {
    for (const zone of ['UTC', NY, LONDON, TOKYO, KATHMANDU]) {
      for (const date of [midnight(2026, 1, 1), midnight(2026, 6, 15), midnight(2026, 12, 31)]) {
        const instant = zonedTimeToUtc(date, zone);
        expect(zonedPartsOf(instant, zone)).toEqual(date);
      }
    }
  });

  it('resolves the day after a spring-forward transition', () => {
    // London springs forward at 01:00 on 2026-03-29; midnight that day is still GMT.
    expect(zonedTimeToUtc(midnight(2026, 3, 29), LONDON).toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    );
    // The next midnight is BST (UTC+1).
    expect(zonedTimeToUtc(midnight(2026, 3, 30), LONDON).toISOString()).toBe(
      '2026-03-29T23:00:00.000Z',
    );
  });

  it('resolves the day after an autumn fall-back transition', () => {
    // London falls back at 02:00 on 2026-10-25.
    expect(zonedTimeToUtc(midnight(2026, 10, 25), LONDON).toISOString()).toBe(
      '2026-10-24T23:00:00.000Z',
    );
    expect(zonedTimeToUtc(midnight(2026, 10, 26), LONDON).toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
  });

  it('normalises a day past the end of the month', () => {
    // Used to express "the day after the 31st" without special-casing.
    expect(zonedTimeToUtc(midnight(2026, 1, 32), 'UTC').toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('normalises month 13 to January of the next year', () => {
    expect(zonedTimeToUtc(midnight(2026, 13, 1), 'UTC').toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('dayRange', () => {
  it('spans exactly 24 hours on an ordinary day', () => {
    const { start, end } = dayRange('2026-07-01', NY);

    expect(start.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-02T04:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });

  it('spans 23 hours on a spring-forward day', () => {
    const { start, end } = dayRange('2026-03-29', LONDON);
    expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000);
  });

  it('spans 25 hours on a fall-back day', () => {
    const { start, end } = dayRange('2026-10-25', LONDON);
    expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000);
  });

  it('crosses a month boundary', () => {
    const { start, end } = dayRange('2026-07-31', 'UTC');
    expect(start.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('dateRangeToInstants', () => {
  it('includes the whole of the last day', () => {
    const { start, end } = dateRangeToInstants('2026-07-01', '2026-07-31', 'UTC');

    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('is a single day when both ends match', () => {
    const { start, end } = dateRangeToInstants('2026-07-01', '2026-07-01', 'UTC');
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });

  it('shifts with the zone', () => {
    const utc = dateRangeToInstants('2026-07-01', '2026-07-01', 'UTC');
    const ny = dateRangeToInstants('2026-07-01', '2026-07-01', NY);

    expect(ny.start.getTime()).toBe(utc.start.getTime() + 4 * 3_600_000);
  });
});

describe('monthRange', () => {
  it('spans a whole calendar month', () => {
    const { start, end } = monthRange(2026, 7, 'UTC');

    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('rolls December into the next January', () => {
    const { end } = monthRange(2026, 12, 'UTC');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles February in a leap year', () => {
    const { start, end } = monthRange(2028, 2, 'UTC');
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(29);
  });

  it('shifts with the zone', () => {
    const { start } = monthRange(2026, 7, TOKYO);
    expect(start.toISOString()).toBe('2026-06-30T15:00:00.000Z');
  });
});

describe('monthBounds', () => {
  it.each([
    [2026, 1, '2026-01-01', '2026-01-31'],
    [2026, 2, '2026-02-01', '2026-02-28'],
    [2028, 2, '2028-02-01', '2028-02-29'],
    [2026, 4, '2026-04-01', '2026-04-30'],
    [2026, 12, '2026-12-01', '2026-12-31'],
  ])('bounds %i-%i as %s..%s', (year, month, from, to) => {
    expect(monthBounds(year, month)).toEqual({ from, to });
  });
});

describe('parseLocalDate', () => {
  it('parses a bare date', () => {
    expect(parseLocalDate('2026-07-01')).toEqual({ year: 2026, month: 7, day: 1 });
  });

  it('ignores a trailing time', () => {
    expect(parseLocalDate('2026-07-01T12:34:56Z')).toEqual({ year: 2026, month: 7, day: 1 });
  });

  it.each(['01/07/2026', '2026-7-1', 'yesterday', ''])('rejects %s', (value) => {
    expect(() => parseLocalDate(value)).toThrow(/YYYY-MM-DD/);
  });
});

describe('shiftLocalDate', () => {
  it.each([
    ['2026-07-01', 1, '2026-07-02'],
    ['2026-07-01', -1, '2026-06-30'],
    ['2026-07-31', 1, '2026-08-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-07-01', 0, '2026-07-01'],
    ['2026-07-01', -30, '2026-06-01'],
  ])('shifts %s by %i to %s', (date, offset, expected) => {
    expect(shiftLocalDate(date, offset)).toBe(expected);
  });
});
