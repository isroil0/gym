import { Prisma } from '@prisma/client';
import {
  currentBmi,
  latestValues,
  summariseProgress,
  type MeasurementPoint,
} from './progress-math';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function point(iso: string, values: MeasurementPoint['values']): MeasurementPoint {
  return { measuredOn: d(iso), values };
}

describe('summariseProgress', () => {
  it('reports the change between the first and latest reading', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 90 }),
      point('2026-03-01', { weightKg: 84 }),
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toEqual({
      metric: 'weightKg',
      first: 90,
      firstMeasuredOn: d('2026-01-01'),
      latest: 84,
      latestMeasuredOn: d('2026-03-01'),
      change: -6,
      changePercent: -6.67,
      readings: 2,
    });
  });

  it('sorts unordered input before comparing', () => {
    const summary = summariseProgress([
      point('2026-03-01', { weightKg: 84 }),
      point('2026-01-01', { weightKg: 90 }),
    ]);

    expect(summary[0].first).toBe(90);
    expect(summary[0].latest).toBe(84);
  });

  it('handles Prisma decimals as well as plain numbers', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: new Prisma.Decimal('90.50') }),
      point('2026-02-01', { weightKg: new Prisma.Decimal('88.25') }),
    ]);

    expect(summary[0].change).toBe(-2.25);
  });

  it('tracks each metric independently, so a sparse series still works', () => {
    // Body fat is measured monthly, weight weekly: comparing whole rows would
    // report no body-fat change at all.
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 90, bodyFatPercent: 24 }),
      point('2026-01-08', { weightKg: 89 }),
      point('2026-01-15', { weightKg: 88 }),
      point('2026-02-01', { weightKg: 86, bodyFatPercent: 21 }),
    ]);

    const weight = summary.find((s) => s.metric === 'weightKg');
    const fat = summary.find((s) => s.metric === 'bodyFatPercent');

    expect(weight?.readings).toBe(4);
    expect(weight?.change).toBe(-4);
    expect(fat?.readings).toBe(2);
    expect(fat?.change).toBe(-3);
  });

  it('uses the first and last readings *of that metric*, not of the series', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 90 }),
      point('2026-02-01', { waistCm: 100 }),
      point('2026-03-01', { waistCm: 94 }),
      point('2026-04-01', { weightKg: 85 }),
    ]);

    const waist = summary.find((s) => s.metric === 'waistCm');
    expect(waist?.firstMeasuredOn).toEqual(d('2026-02-01'));
    expect(waist?.latestMeasuredOn).toEqual(d('2026-03-01'));
  });

  it('omits a metric with only one reading, since that is not progress', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 90, bodyFatPercent: 24 }),
      point('2026-02-01', { weightKg: 88 }),
    ]);

    expect(summary.map((s) => s.metric)).toEqual(['weightKg']);
  });

  it('is empty for an empty series', () => {
    expect(summariseProgress([])).toEqual([]);
  });

  it('reports a gain as a positive change', () => {
    const summary = summariseProgress([
      point('2026-01-01', { muscleMassKg: 35 }),
      point('2026-06-01', { muscleMassKg: 38.5 }),
    ]);

    expect(summary[0].change).toBe(3.5);
    expect(summary[0].changePercent).toBe(10);
  });

  it('reports no change as zero rather than minus zero', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 80 }),
      point('2026-02-01', { weightKg: 80 }),
    ]);

    expect(summary[0].change).toBe(0);
    expect(Object.is(summary[0].change, -0)).toBe(false);
    expect(summary[0].changePercent).toBe(0);
  });

  it('declines to compute a percentage from a zero baseline', () => {
    const summary = summariseProgress([
      point('2026-01-01', { restingHeartRate: 0 }),
      point('2026-02-01', { restingHeartRate: 60 }),
    ]);

    expect(summary[0].changePercent).toBeNull();
  });

  it('ignores null values rather than treating them as zero', () => {
    const summary = summariseProgress([
      point('2026-01-01', { weightKg: 90 }),
      point('2026-02-01', { weightKg: null }),
      point('2026-03-01', { weightKg: 85 }),
    ]);

    expect(summary[0].readings).toBe(2);
    expect(summary[0].change).toBe(-5);
  });
});

describe('latestValues', () => {
  it('takes the most recent non-null reading per metric', () => {
    const values = latestValues([
      point('2026-01-01', { weightKg: 90, heightCm: 180 }),
      point('2026-02-01', { weightKg: 88 }),
    ]);

    expect(values).toEqual({ weightKg: 88, heightCm: 180 });
  });

  it('is empty for an empty series', () => {
    expect(latestValues([])).toEqual({});
  });

  it('skips a metric never recorded', () => {
    const values = latestValues([point('2026-01-01', { weightKg: 90 })]);
    expect(values.waistCm).toBeUndefined();
  });
});

describe('currentBmi', () => {
  it('computes BMI from the latest weight and height', () => {
    expect(currentBmi([point('2026-01-01', { weightKg: 81, heightCm: 180 })])).toBe(25);
  });

  it('uses the latest weight with an older height', () => {
    const bmi = currentBmi([
      point('2026-01-01', { heightCm: 180 }),
      point('2026-06-01', { weightKg: 64.8 }),
    ]);

    expect(bmi).toBe(20);
  });

  it('is null when height is unknown', () => {
    expect(currentBmi([point('2026-01-01', { weightKg: 80 })])).toBeNull();
  });

  it('is null when weight is unknown', () => {
    expect(currentBmi([point('2026-01-01', { heightCm: 180 })])).toBeNull();
  });

  it('is null rather than infinite for a zero height', () => {
    expect(currentBmi([point('2026-01-01', { weightKg: 80, heightCm: 0 })])).toBeNull();
  });
});
