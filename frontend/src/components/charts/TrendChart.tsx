'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import { LineChart } from '@mui/x-charts/LineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { useChartColors, useChartSx } from './ChartTheme';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatCompact } from '@/lib/format/number';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/**
 * A time series with locale-aware axes.
 *
 * Bucket labels arrive from the backend already grouped in the gym's
 * timezone, so they are formatted for reading and never re-zoned.
 */
export function TrendChart({
  buckets,
  series,
  height = 260,
  variant = 'line',
  stacked = false,
  valueFormatter,
}: {
  buckets: string[];
  series: TrendSeries[];
  height?: number;
  variant?: 'line' | 'bar';
  stacked?: boolean;
  valueFormatter?: (value: number | null) => string;
}) {
  const t = useTranslations('reports.empty');
  const { locale } = useLocale();
  const sx = useChartSx();
  useChartColors();

  const labels = useMemo(() => buckets.map((bucket) => shortBucket(bucket, locale)), [buckets, locale]);
  const hasData = buckets.length > 0 && series.some((s) => s.values.some((v) => v !== 0));

  if (!hasData) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <EmptyState title={t('title')} body={t('body')} compact />
      </Box>
    );
  }

  const axis = [
    {
      data: labels,
      scaleType: 'band' as const,
      // On a month of daily buckets, every label would collide. Thinning
      // keeps the axis readable without hiding the shape of the data.
      tickInterval: (_: unknown, index: number) =>
        labels.length <= 14 ? true : index % Math.ceil(labels.length / 10) === 0,
    },
  ];

  const yAxis = [
    {
      valueFormatter: (value: number) => formatCompact(value, locale),
      width: 56,
    },
  ];

  const common = {
    height,
    xAxis: axis,
    yAxis,
    margin: { left: 8, right: 8, top: 16, bottom: 8 },
    grid: { horizontal: true },
    sx,
    slotProps: { legend: { hidden: series.length < 2 } as never },
  };

  if (variant === 'bar') {
    return (
      <BarChart
        {...common}
        series={series.map((s) => ({
          data: s.values,
          label: s.label,
          color: s.color,
          stack: stacked ? 'total' : undefined,
          valueFormatter: valueFormatter ?? ((value: number | null) => String(value ?? '')),
        }))}
        borderRadius={4}
      />
    );
  }

  return (
    <LineChart
      {...common}
      series={series.map((s) => ({
        data: s.values,
        label: s.label,
        color: s.color,
        area: series.length === 1,
        showMark: labels.length <= 31,
        curve: 'monotoneX' as const,
        valueFormatter: valueFormatter ?? ((value: number | null) => String(value ?? '')),
      }))}
    />
  );
}

/** "2026-10-01" → "1 Oct"; "2026-10" → "Oct 2026". */
function shortBucket(bucket: string, locale: string): string {
  const tag = locale === 'uz' ? 'uz-Latn-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const [year, month] = bucket.split('-').map(Number);
    return new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year!, month! - 1, 1)),
    );
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
    const [year, month, day] = bucket.split('-').map(Number);
    return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year!, month! - 1, day!)),
    );
  }
  return bucket;
}
