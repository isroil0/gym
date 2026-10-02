import { describe, expect, it } from 'vitest';
import { dateAnchors, formatDate, formatDuration, toIsoDate } from '../datetime';

describe('date formatting', () => {
  it('never shifts a calendar date into another day', () => {
    // A membership ending on the 1st ends on the 1st everywhere. Treating it
    // as an instant and converting it would show 30 September in some zones.
    expect(formatDate('2026-10-01', 'en')).toContain('01');
    expect(formatDate('2026-10-01', 'en')).toContain('2026');
    expect(formatDate('2026-10-01T00:00:00.000Z', 'en')).toBe(formatDate('2026-10-01', 'en'));
  });

  it('formats a real instant in the gym’s timezone', () => {
    // 22:30 UTC is already the next day in Tashkent (UTC+5).
    expect(toIsoDate('2026-10-01T22:30:00.000Z')).toBe('2026-10-02');
  });

  it('returns an em dash rather than "Invalid Date"', () => {
    expect(formatDate(null, 'en')).toBe('—');
    expect(formatDate('not-a-date', 'en')).toBe('—');
  });

  it('formats durations in hours and minutes', () => {
    expect(formatDuration(45, 'en')).toBe('45 min');
    expect(formatDuration(60, 'en')).toBe('1 h');
    expect(formatDuration(95, 'en')).toBe('1 h 35 min');
    expect(formatDuration(null, 'en')).toBe('—');
  });

  it('derives report anchors that are consistent with each other', () => {
    const anchors = dateAnchors(new Date('2026-10-15T09:00:00.000Z'));
    expect(anchors.today).toBe('2026-10-15');
    expect(anchors.yesterday).toBe('2026-10-14');
    expect(anchors.monthStart).toBe('2026-10-01');
    expect(anchors.yearStart).toBe('2026-01-01');
    expect(anchors.last7).toBe('2026-10-09');
    expect(anchors.last30).toBe('2026-09-16');
  });
});
