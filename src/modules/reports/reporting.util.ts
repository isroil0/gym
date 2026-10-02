import type { GymTimeService } from '../../common/time/gym-time.service';
import { ReportGrouping } from './dto/common.dto';

/**
 * Buckets a set of instants into local days or months.
 *
 * Grouping in application code rather than SQL is deliberate: Postgres would
 * need the zone threaded into every `date_trunc`, and the two would drift. One
 * bucketing function, driven by the same `GymTimeService` the period boundaries
 * come from, keeps every report consistent with every other.
 */
export function bucketKey(
  instant: Date,
  grouping: ReportGrouping,
  gymTime: GymTimeService,
): string {
  const localDate = gymTime.localDateOf(instant);
  return grouping === ReportGrouping.MONTH ? localDate.slice(0, 7) : localDate;
}

/** Every bucket label between two local dates, so empty periods still appear. */
export function bucketLabels(
  fromLocalDate: string,
  toLocalDate: string,
  grouping: ReportGrouping,
  gymTime: GymTimeService,
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  let cursor = fromLocalDate;
  // Bounded so a reversed or absurd range cannot spin: ~5 years of days.
  for (let step = 0; step < 2000 && cursor <= toLocalDate; step += 1) {
    const label = grouping === ReportGrouping.MONTH ? cursor.slice(0, 7) : cursor;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
    cursor = gymTime.shift(cursor, 1);
  }

  return labels;
}

/**
 * Fills a sparse map of totals into a dense series.
 *
 * A revenue chart with the quiet days missing is misleading — it implies no
 * data rather than no money.
 */
export function densify<T>(
  labels: string[],
  totals: Map<string, T>,
  zero: () => T,
): Array<{ bucket: string; value: T }> {
  return labels.map((bucket) => ({ bucket, value: totals.get(bucket) ?? zero() }));
}
