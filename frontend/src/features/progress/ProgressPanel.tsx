'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ArrowUpIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownIcon from '@mui/icons-material/ArrowDownwardRounded';
import { LineChart } from '@mui/x-charts/LineChart';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ChartSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { useChartColors, useChartSx } from '@/components/charts/ChartTheme';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import type { MemberProgress, MetricProgress } from './useProgress';
import { PROGRESS_METRICS, type ProgressMetric } from '@/lib/api/types';

/** The unit each metric is measured in. */
const UNIT: Record<ProgressMetric, 'kg' | 'cm' | 'percent' | 'bpm'> = {
  weightKg: 'kg',
  heightCm: 'cm',
  bodyFatPercent: 'percent',
  muscleMassKg: 'kg',
  chestCm: 'cm',
  waistCm: 'cm',
  hipsCm: 'cm',
  thighCm: 'cm',
  armCm: 'cm',
  restingHeartRate: 'bpm',
};

/** Metrics where going down is the good direction. */
const LOWER_IS_BETTER = new Set<ProgressMetric>([
  'bodyFatPercent',
  'waistCm',
  'restingHeartRate',
]);

/**
 * Measurements over time.
 *
 * The backend computes first, latest, change and the full series per metric,
 * so nothing here recalculates progress — it only decides which direction
 * counts as good, which is a judgement the API does not make.
 */
export function ProgressPanel({
  progress,
  isPending,
  emptyTitle,
  emptyBody,
  action,
}: {
  progress: MemberProgress | undefined;
  isPending: boolean;
  emptyTitle: string;
  emptyBody?: string;
  action?: React.ReactNode;
}) {
  const t = useTranslations('progress');
  const { locale } = useLocale();
  const colors = useChartColors();
  const chartSx = useChartSx();

  // `readings` is a count, not a series: the backend reports first, latest
  // and change per metric, and the points themselves live in `measurements`.
  const withData = useMemo(
    () => (progress?.progress ?? []).filter((metric) => metric.readings > 0),
    [progress],
  );
  const [selected, setSelected] = useState<ProgressMetric | ''>('');

  const metric = useMemo<MetricProgress | undefined>(() => {
    if (withData.length === 0) return undefined;
    const chosen = selected || withData[0]!.metric;
    return withData.find((entry) => entry.metric === chosen) ?? withData[0];
  }, [withData, selected]);

  // The series for the selected metric, built from the measurements the
  // backend returned and ordered oldest first so the line reads left to right.
  const series = useMemo(() => {
    if (!metric) return [] as Array<{ date: string; value: number }>;
    const field = metric.metric as ProgressMetric;
    return (progress?.measurements ?? [])
      .map((measurement) => ({
        date: measurement.measuredOn,
        value: measurement[field] as number | null | undefined,
      }))
      .filter((point): point is { date: string; value: number } =>
        typeof point.value === 'number' && Number.isFinite(point.value),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [metric, progress]);


  if (isPending) {
    return (
      <Stack spacing={2.5}>
        <ListSkeleton rows={3} />
        <ChartSkeleton />
      </Stack>
    );
  }

  if (!progress || progress.measurementCount === 0 || withData.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title={emptyTitle} body={emptyBody} action={action} />
        </CardContent>
      </Card>
    );
  }

  const unitLabel = metric ? t(`units.${UNIT[metric.metric as ProgressMetric]}`) : '';

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        {withData.slice(0, 4).map((entry) => (
          <MetricTile key={entry.metric} metric={entry} />
        ))}
      </Box>

      {progress.bmi ? (
        <Card>
          <CardContent sx={{ py: 2 }}>
            <Stack direction="row" spacing={2} alignItems="baseline">
              <Typography variant="caption" color="text.secondary">
                {t('bmi.label')}
              </Typography>
              <Typography variant="h4" className="tabular">
                {formatNumber(progress.bmi, locale, { maximumFractionDigits: 1 })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {bmiBand(Number(progress.bmi), t)}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <SectionCard
        title={metric ? t('chart.title', { metric: t(`metrics.${metric.metric}`) }) : t('title')}
        action={
          <TextField
            select
            size="small"
            value={metric?.metric ?? ''}
            onChange={(event) => setSelected(event.target.value as ProgressMetric)}
            label={t('chart.selectMetric')}
            sx={{ minWidth: 170 }}
          >
            {PROGRESS_METRICS.filter((name) => withData.some((entry) => entry.metric === name)).map(
              (name) => (
                <MenuItem key={name} value={name}>
                  {t(`metrics.${name}`)}
                </MenuItem>
              ),
            )}
          </TextField>
        }
      >
        {series.length < 2 ? (
          <EmptyState title={t('chart.noData')} body={t('chart.noDataHint')} compact />
        ) : (
          <LineChart
            height={280}
            xAxis={[
              {
                data: series.map((point) => formatDate(point.date, locale)),
                scaleType: 'band',
              },
            ]}
            yAxis={[{ width: 56 }]}
            series={[
              {
                data: series.map((point) => point.value),
                label: metric ? `${t(`metrics.${metric.metric}`)} (${unitLabel})` : '',
                color: colors.profit,
                curve: 'monotoneX',
                showMark: series.length <= 24,
                area: true,
              },
            ]}
            margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            grid={{ horizontal: true }}
            sx={chartSx}
          />
        )}
      </SectionCard>
    </Stack>
  );
}

function MetricTile({ metric }: { metric: MetricProgress }) {
  const t = useTranslations('progress');
  const { locale } = useLocale();

  const name = metric.metric as ProgressMetric;
  const unit = t(`units.${UNIT[name]}`);
  const change = metric.change == null ? null : Number(metric.change);
  const improved =
    change === null || change === 0
      ? null
      : LOWER_IS_BETTER.has(name)
        ? change < 0
        : change > 0;

  return (
    <Card>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {t(`metrics.${name}`)}
        </Typography>
        <Typography variant="h3" className="tabular" sx={{ mt: 0.5 }}>
          {formatNumber(metric.latest, locale, { maximumFractionDigits: 1 })}
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        </Typography>

        {change !== null && change !== 0 ? (
          <Stack direction="row" spacing={0.25} alignItems="center" sx={{ mt: 0.25 }}>
            {change > 0 ? (
              <ArrowUpIcon sx={{ fontSize: 13, color: improved ? 'success.main' : 'warning.main' }} />
            ) : (
              <ArrowDownIcon sx={{ fontSize: 13, color: improved ? 'success.main' : 'warning.main' }} />
            )}
            <Typography
              variant="caption"
              className="tabular"
              sx={{ color: improved ? 'success.main' : 'warning.main', fontWeight: 560 }}
            >
              {formatNumber(Math.abs(change), locale, { maximumFractionDigits: 1 })} {unit}
            </Typography>
            {metric.firstMeasuredOn ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {t('change.since', { date: formatDate(metric.firstMeasuredOn, locale) })}
              </Typography>
            ) : null}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {change === 0 ? t('change.noChange') : t('change.first')}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function bmiBand(bmi: number, t: (key: string) => string): string {
  if (bmi < 18.5) return t('bmi.underweight');
  if (bmi < 25) return t('bmi.normal');
  if (bmi < 30) return t('bmi.overweight');
  return t('bmi.obese');
}
