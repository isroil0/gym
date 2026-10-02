import { Prisma } from '@prisma/client';

/**
 * Progress arithmetic over a series of body measurements.
 *
 * Measurements are sparse by nature — a trainer takes a weight every week but
 * a body-fat reading once a month — so "first" and "latest" are computed per
 * metric rather than per measurement date. Comparing two whole measurement
 * rows would otherwise report "no change" simply because the latest row left
 * that field blank.
 */

export const TRACKED_METRICS = [
  'weightKg',
  'heightCm',
  'bodyFatPercent',
  'muscleMassKg',
  'chestCm',
  'waistCm',
  'hipsCm',
  'thighCm',
  'armCm',
  'restingHeartRate',
] as const;

export type TrackedMetric = (typeof TRACKED_METRICS)[number];

/** A measurement row, reduced to what progress needs. */
export interface MeasurementPoint {
  measuredOn: Date;
  values: Partial<Record<TrackedMetric, Prisma.Decimal | number | null>>;
}

export interface MetricProgress {
  metric: TrackedMetric;
  first: number;
  firstMeasuredOn: Date;
  latest: number;
  latestMeasuredOn: Date;
  /** latest − first. Negative means the figure came down. */
  change: number;
  /** Percentage change relative to the first reading, or null when it was zero. */
  changePercent: number | null;
  /** Number of readings for this metric in the series. */
  readings: number;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

/** Rounds to two decimals, avoiding `-0` and binary noise like 1.4000000000000001. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100 + 0;
}

/**
 * Per-metric first-to-latest change across a series.
 *
 * `points` may arrive in any order; it is sorted by date here so callers need
 * not care. A metric with fewer than two readings is omitted — a single data
 * point is not progress.
 */
export function summariseProgress(points: MeasurementPoint[]): MetricProgress[] {
  const ordered = [...points].sort((a, b) => a.measuredOn.getTime() - b.measuredOn.getTime());

  const summaries: MetricProgress[] = [];

  for (const metric of TRACKED_METRICS) {
    const readings = ordered
      .map((point) => ({ on: point.measuredOn, value: toNumber(point.values[metric]) }))
      .filter((reading): reading is { on: Date; value: number } => reading.value !== null);

    if (readings.length < 2) continue;

    const first = readings[0];
    const latest = readings[readings.length - 1];
    const change = latest.value - first.value;

    summaries.push({
      metric,
      first: round2(first.value),
      firstMeasuredOn: first.on,
      latest: round2(latest.value),
      latestMeasuredOn: latest.on,
      change: round2(change),
      changePercent: first.value === 0 ? null : round2((change / first.value) * 100),
      readings: readings.length,
    });
  }

  return summaries;
}

/** The most recent non-null value for each metric, for a "current stats" view. */
export function latestValues(points: MeasurementPoint[]): Partial<Record<TrackedMetric, number>> {
  const ordered = [...points].sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime());

  const latest: Partial<Record<TrackedMetric, number>> = {};

  for (const metric of TRACKED_METRICS) {
    for (const point of ordered) {
      const value = toNumber(point.values[metric]);
      if (value !== null) {
        latest[metric] = round2(value);
        break;
      }
    }
  }

  return latest;
}

/**
 * Body mass index from the most recent weight and height in the series.
 * Null unless both are known, since a BMI from a guessed height is worse than
 * none at all.
 */
export function currentBmi(points: MeasurementPoint[]): number | null {
  const latest = latestValues(points);
  const weight = latest.weightKg;
  const height = latest.heightCm;

  if (weight === undefined || height === undefined || height <= 0) return null;

  const metres = height / 100;
  return round2(weight / (metres * metres));
}
