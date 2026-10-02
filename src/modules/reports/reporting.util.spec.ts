import { ReportGrouping } from './dto/common.dto';
import { bucketKey, bucketLabels, densify } from './reporting.util';
import type { GymTimeService } from '../../common/time/gym-time.service';
import { shiftLocalDate, zonedDateString } from '../../common/time/zoned-time';

function gymTime(zone: string): GymTimeService {
  return {
    zone,
    localDateOf: (instant: Date) => zonedDateString(instant, zone),
    shift: (localDate: string, days: number) => shiftLocalDate(localDate, days),
  } as unknown as GymTimeService;
}

describe('bucketKey', () => {
  it('buckets by local day', () => {
    expect(
      bucketKey(new Date('2026-10-15T12:00:00.000Z'), ReportGrouping.DAY, gymTime('UTC')),
    ).toBe('2026-10-15');
  });

  it('buckets by local month', () => {
    expect(
      bucketKey(new Date('2026-10-15T12:00:00.000Z'), ReportGrouping.MONTH, gymTime('UTC')),
    ).toBe('2026-10');
  });

  it("uses the gym's day, not UTC's", () => {
    // 02:00 UTC is still the previous evening in New York.
    const instant = new Date('2026-10-16T02:00:00.000Z');

    expect(bucketKey(instant, ReportGrouping.DAY, gymTime('UTC'))).toBe('2026-10-16');
    expect(bucketKey(instant, ReportGrouping.DAY, gymTime('America/New_York'))).toBe('2026-10-15');
  });

  it('can move a visit into the previous month for a zone behind UTC', () => {
    // 01:00 UTC on 1 November is 31 October in New York.
    const instant = new Date('2026-11-01T01:00:00.000Z');

    expect(bucketKey(instant, ReportGrouping.MONTH, gymTime('UTC'))).toBe('2026-11');
    expect(bucketKey(instant, ReportGrouping.MONTH, gymTime('America/New_York'))).toBe('2026-10');
  });
});

describe('bucketLabels', () => {
  const utc = gymTime('UTC');

  it('lists every day in the range, inclusive of both ends', () => {
    expect(bucketLabels('2026-10-01', '2026-10-04', ReportGrouping.DAY, utc)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('lists a single day when both ends match', () => {
    expect(bucketLabels('2026-10-01', '2026-10-01', ReportGrouping.DAY, utc)).toEqual([
      '2026-10-01',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(bucketLabels('2026-10-30', '2026-11-02', ReportGrouping.DAY, utc)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('deduplicates months spanning many days', () => {
    expect(bucketLabels('2026-08-15', '2026-10-05', ReportGrouping.MONTH, utc)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('covers a leap February', () => {
    expect(bucketLabels('2028-02-01', '2028-02-29', ReportGrouping.DAY, utc)).toHaveLength(29);
  });

  it('is empty for a reversed range rather than looping', () => {
    expect(bucketLabels('2026-10-04', '2026-10-01', ReportGrouping.DAY, utc)).toEqual([]);
  });

  it('is bounded, so an absurd range cannot spin', () => {
    const labels = bucketLabels('2000-01-01', '2099-12-31', ReportGrouping.DAY, utc);
    expect(labels.length).toBeLessThanOrEqual(2000);
  });
});

describe('densify', () => {
  it('fills missing buckets with the zero value', () => {
    const totals = new Map([['2026-10-02', 5]]);

    expect(densify(['2026-10-01', '2026-10-02', '2026-10-03'], totals, () => 0)).toEqual([
      { bucket: '2026-10-01', value: 0 },
      { bucket: '2026-10-02', value: 5 },
      { bucket: '2026-10-03', value: 0 },
    ]);
  });

  it('is empty when there are no labels', () => {
    expect(densify([], new Map(), () => 0)).toEqual([]);
  });

  it('ignores totals for buckets outside the labels', () => {
    const totals = new Map([
      ['2026-10-01', 1],
      ['2026-11-01', 99],
    ]);

    expect(densify(['2026-10-01'], totals, () => 0)).toEqual([{ bucket: '2026-10-01', value: 1 }]);
  });
});
