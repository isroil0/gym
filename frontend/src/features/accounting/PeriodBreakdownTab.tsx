'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { DataTable } from '@/components/data/DataTable';
import { SectionCard } from '@/components/ui/SectionCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { useChartColors } from '@/components/charts/ChartTheme';
import { ChartSkeleton } from '@/components/feedback/Skeletons';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatDate } from '@/lib/format/datetime';
import { useDailyTotals, type PeriodBucket } from './useAccounting';

/**
 * Day by day, as the ledger records it.
 *
 * This is the accounting view of the period — straight from
 * `GET /accounting/daily`. The Reports area answers different questions
 * (sales, renewals, attendance); this one answers "what moved, and when".
 */
export function PeriodBreakdownTab({ range }: { range: { from: string; to: string } }) {
  const t = useTranslations('accounting.overview');
  const ta = useTranslations('accounting');
  const { locale } = useLocale();
  const colors = useChartColors();

  const { data, isPending, isError, refetch } = useDailyTotals(range);

  const rows = useMemo(
    () => (data ?? []).map((bucket) => ({ ...bucket, id: bucket.date })),
    [data],
  );

  const columns = useMemo<GridColDef<PeriodBucket & { id: string }>[]>(
    () => [
      {
        field: 'date',
        headerName: ta('entries.columns.date'),
        width: 130,
        valueGetter: (_, row) => formatDate(row.date, locale),
      },
      {
        field: 'income',
        headerName: t('income'),
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.income, locale),
      },
      {
        field: 'refunds',
        headerName: t('refunds'),
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.refunds, locale),
      },
      {
        field: 'revenue',
        headerName: t('revenue'),
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.revenue, locale),
      },
      {
        field: 'expenses',
        headerName: t('expenses'),
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.expenses, locale),
      },
      {
        field: 'profit',
        headerName: t('profit'),
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Typography
            variant="body2"
            className="tabular"
            sx={{ fontWeight: 560, color: Number(row.profit) >= 0 ? 'success.main' : 'error.main' }}
          >
            {formatMoney(row.profit, locale)}
          </Typography>
        ),
      },
    ],
    [t, ta, locale],
  );

  return (
    <Stack spacing={2.5}>
      <SectionCard title={t('profit')}>
        {isPending ? (
          <ChartSkeleton height={220} />
        ) : (
          <TrendChart
            height={240}
            buckets={(data ?? []).map((bucket) => bucket.date)}
            valueFormatter={(value) => formatMoney(value ?? 0, locale)}
            series={[
              {
                key: 'profit',
                label: t('profit'),
                color: colors.profit,
                values: (data ?? []).map((bucket) => Number(bucket.profit)),
              },
            ]}
          />
        )}
      </SectionCard>

      <Box>
        <DataTable
          rows={rows}
          columns={columns}
          loading={isPending}
          error={isError ? new Error('failed') : null}
          onRetry={() => void refetch()}
          emptyTitle={ta('entries.empty')}
          getRowId={(row) => row.id}
          hideFooter
          minHeight={320}
        />
      </Box>
    </Stack>
  );
}
