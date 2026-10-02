'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { DataTable } from '@/components/data/DataTable';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { TrendChart } from '@/components/charts/TrendChart';
import { useChartColors } from '@/components/charts/ChartTheme';
import { MetricCardSkeleton } from '@/components/feedback/Skeletons';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { dateAnchors } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { formatNumber, formatPercent } from '@/lib/format/number';
import { downloadCsv } from './csv';
import { useReport, useUnpaidReport } from './useReports';
import type {
  AttendanceReport,
  ExpenseReport,
  ExpiredMembershipsReport,
  MembershipSalesReport,
  ProfitReport,
  RenewalsReport,
  RevenueReport,
  TrainerStatsReport,
  UnpaidBalancesReport,
} from '@/features/dashboard/types';

const TABS = [
  'revenue',
  'expenses',
  'profit',
  'membershipSales',
  'renewals',
  'expired',
  'attendance',
  'unpaid',
  'trainers',
] as const;

const DEFAULTS = { from: '', to: '', groupBy: 'day' };

/**
 * The nine reports the backend publishes, each shown as the backend computes
 * it. Nothing here re-derives a figure; the CSV exports exactly what is on
 * screen.
 */
export function ReportsPage({ tab = 'revenue' }: { tab?: string }) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const tp = useTranslations('payments');
  const { locale } = useLocale();
  const toast = useToast();
  const colors = useChartColors();
  const { state, set } = useQueryState(DEFAULTS);

  const range = useMemo(() => {
    const anchors = dateAnchors();
    return {
      from: state.from || anchors.monthStart,
      to: state.to || anchors.today,
      groupBy: (state.groupBy === 'month' ? 'month' : 'day') as 'day' | 'month',
    };
  }, [state.from, state.to, state.groupBy]);

  const active = (TABS as readonly string[]).includes(tab) ? tab : 'revenue';

  // Only the visible report is fetched.
  const revenue = useReport<RevenueReport>('revenue', range, active === 'revenue');
  const expenses = useReport<ExpenseReport>('expenses', range, active === 'expenses');
  const profit = useReport<ProfitReport>('profit', range, active === 'profit');
  const sales = useReport<MembershipSalesReport>('membership-sales', range, active === 'membershipSales');
  const renewals = useReport<RenewalsReport>('renewals', range, active === 'renewals');
  const expired = useReport<ExpiredMembershipsReport>('expired-memberships', range, active === 'expired');
  const attendance = useReport<AttendanceReport>('attendance', range, active === 'attendance');
  const unpaid = useUnpaidReport<UnpaidBalancesReport>(active === 'unpaid');
  const trainers = useReport<TrainerStatsReport>('trainer-stats', range, active === 'trainers');

  const money = (value: string | number | null | undefined) => formatMoney(value ?? null, locale);
  const count = (value: number | null | undefined) => formatNumber(value ?? null, locale);

  const exportCurrent = () => {
    const stamp = `${range.from}_${range.to}`;
    switch (active) {
      case 'revenue':
        downloadCsv(
          `revenue_${stamp}`,
          ['bucket', 'revenue'],
          (revenue.data?.series ?? []).map((point) => [point.bucket, point.value]),
        );
        break;
      case 'expenses':
        downloadCsv(
          `expenses_${stamp}`,
          ['category', 'amount'],
          (expenses.data?.byCategory ?? []).map((row) => [row.expenseCategoryName, row.amount]),
        );
        break;
      case 'profit':
        downloadCsv(
          `profit_${stamp}`,
          ['bucket', 'revenue', 'expenses', 'profit'],
          (profit.data?.series ?? []).map((p) => [p.bucket, p.revenue, p.expenses, p.profit]),
        );
        break;
      case 'unpaid':
        downloadCsv(
          `unpaid_${range.to}`,
          ['memberCode', 'memberName', 'outstanding'],
          (unpaid.data?.balances ?? []).map((row) => [row.memberCode, row.memberName, row.outstanding]),
        );
        break;
      case 'trainers':
        downloadCsv(
          `trainer_stats_${stamp}`,
          ['trainerCode', 'trainerName', 'assignedMembers', 'plansWritten', 'sessionsCompleted'],
          (trainers.data?.stats ?? []).map((row) => [
            row.trainerCode,
            row.trainerName,
            row.assignedMembers,
            row.plansWritten,
            row.sessionsCompleted,
          ]),
        );
        break;
      default:
        downloadCsv(`${active}_${stamp}`, ['period'], [[`${range.from} – ${range.to}`]]);
    }
    toast.success(t('exported'));
  };

  const trainerColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'trainerCode', headerName: t('trainerStats.trainer'), width: 110 },
      { field: 'trainerName', headerName: tc('labels.name'), flex: 1, minWidth: 160 },
      {
        field: 'assignedMembers',
        headerName: t('trainerStats.assignedMembers'),
        width: 110,
        align: 'right',
        headerAlign: 'right',
      },
      {
        field: 'plansWritten',
        headerName: t('trainerStats.plansWritten'),
        width: 100,
        align: 'right',
        headerAlign: 'right',
      },
      {
        field: 'sessionsCompleted',
        headerName: t('trainerStats.sessionsCompleted'),
        width: 120,
        align: 'right',
        headerAlign: 'right',
      },
      {
        field: 'noShows',
        headerName: t('trainerStats.noShows'),
        width: 100,
        align: 'right',
        headerAlign: 'right',
      },
    ],
    [t, tc],
  );

  const unpaidColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'memberCode', headerName: tp('columns.member'), width: 120 },
      { field: 'memberName', headerName: tc('labels.name'), flex: 1, minWidth: 180 },
      {
        field: 'outstanding',
        headerName: tp('billing.outstanding'),
        width: 150,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_: unknown, row: { outstanding: string }) => money(row.outstanding),
      },
    ],
    [tp, tc, locale], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon sx={{ fontSize: 17 }} />}
            onClick={exportCurrent}
          >
            {t('exportCsv')}
          </Button>
        }
      />

      <TabbedSection
        tabs={TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
        active={active}
        param="view"
      >
        {active !== 'unpaid' ? (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ sm: 'center' }}
            sx={{ mb: 2.5 }}
          >
            <DateRangePicker
              value={{ from: range.from, to: range.to }}
              onChange={(next) => set({ from: next.from, to: next.to })}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={range.groupBy}
              onChange={(_, value: 'day' | 'month' | null) => value && set({ groupBy: value })}
              aria-label={t('groupBy.label')}
            >
              <ToggleButton value="day">{t('groupBy.day')}</ToggleButton>
              <ToggleButton value="month">{t('groupBy.month')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        ) : null}

        {active === 'revenue' ? (
          revenue.isPending ? (
            <MetricCardSkeleton count={3} />
          ) : (
            <Stack spacing={2.5}>
              <Cards
                items={[
                  { label: t('revenue.income'), value: money(revenue.data?.income), tone: 'success' },
                  { label: t('revenue.refunds'), value: money(revenue.data?.refunds), tone: 'warning' },
                  { label: t('revenue.net'), value: money(revenue.data?.revenue), tone: 'accent' },
                ]}
              />
              <SectionCard title={t('revenue.chartLabel')}>
                <TrendChart
                  height={300}
                  variant="bar"
                  buckets={(revenue.data?.series ?? []).map((p) => p.bucket)}
                  valueFormatter={(value) => money(value ?? 0)}
                  series={[
                    {
                      key: 'revenue',
                      label: t('revenue.chartLabel'),
                      color: colors.revenue,
                      values: (revenue.data?.series ?? []).map((p) => Number(p.value)),
                    },
                  ]}
                />
              </SectionCard>
            </Stack>
          )
        ) : null}

        {active === 'expenses' ? (
          expenses.isPending ? (
            <MetricCardSkeleton count={1} />
          ) : (
            <Stack spacing={2.5}>
              <Cards items={[{ label: t('expenses.total'), value: money(expenses.data?.expenses), tone: 'danger' }]} />
              <SectionCard title={t('expenses.chartLabel')}>
                <TrendChart
                  height={300}
                  variant="bar"
                  buckets={(expenses.data?.series ?? []).map((p) => p.bucket)}
                  valueFormatter={(value) => money(value ?? 0)}
                  series={[
                    {
                      key: 'expenses',
                      label: t('expenses.chartLabel'),
                      color: colors.expenses,
                      values: (expenses.data?.series ?? []).map((p) => Number(p.value)),
                    },
                  ]}
                />
              </SectionCard>
            </Stack>
          )
        ) : null}

        {active === 'profit' ? (
          profit.isPending ? (
            <MetricCardSkeleton count={4} />
          ) : (
            <Stack spacing={2.5}>
              <Cards
                items={[
                  { label: t('profit.revenue'), value: money(profit.data?.revenue), tone: 'success' },
                  { label: t('profit.expenses'), value: money(profit.data?.expenses), tone: 'danger' },
                  {
                    label: t('profit.result'),
                    value: money(profit.data?.profit),
                    tone: Number(profit.data?.profit ?? 0) >= 0 ? 'success' : 'danger',
                  },
                  {
                    label: t('profit.margin'),
                    value: formatPercent(profit.data?.marginPercent ?? 0, locale),
                    tone: 'accent',
                  },
                ]}
              />
              <SectionCard title={t('profit.chartLabel')}>
                <TrendChart
                  height={300}
                  buckets={(profit.data?.series ?? []).map((p) => p.bucket)}
                  valueFormatter={(value) => money(value ?? 0)}
                  series={[
                    {
                      key: 'profit',
                      label: t('profit.result'),
                      color: colors.profit,
                      values: (profit.data?.series ?? []).map((p) => Number(p.profit)),
                    },
                  ]}
                />
              </SectionCard>
            </Stack>
          )
        ) : null}

        {active === 'membershipSales' ? (
          sales.isPending ? (
            <MetricCardSkeleton count={4} />
          ) : (
            <Cards
              items={[
                { label: t('membershipSales.totalSold'), value: count(sales.data?.totalSold) },
                { label: t('membershipSales.grossValue'), value: money(sales.data?.grossValue), tone: 'success' },
                { label: t('membershipSales.discounts'), value: money(sales.data?.discounts), tone: 'warning' },
                { label: t('membershipSales.renewals'), value: count(sales.data?.renewals) },
              ]}
            />
          )
        ) : null}

        {active === 'renewals' ? (
          renewals.isPending ? (
            <MetricCardSkeleton count={2} />
          ) : (
            <Cards
              items={[
                { label: t('renewals.totalRenewals'), value: count(renewals.data?.totalRenewals), tone: 'success' },
                {
                  label: t('renewals.renewalRate'),
                  value: formatPercent(renewals.data?.renewalRatePercent ?? 0, locale),
                  tone: 'accent',
                },
              ]}
            />
          )
        ) : null}

        {active === 'expired' ? (
          expired.isPending ? (
            <MetricCardSkeleton count={2} />
          ) : (
            <Cards
              items={[
                { label: t('expired.totalExpired'), value: count(expired.data?.totalExpired), tone: 'warning' },
                { label: t('expired.notRenewed'), value: count(expired.data?.notReturned), tone: 'danger' },
              ]}
            />
          )
        ) : null}

        {active === 'attendance' ? (
          attendance.isPending ? (
            <MetricCardSkeleton count={3} />
          ) : (
            <Stack spacing={2.5}>
              <Cards
                items={[
                  { label: t('attendance.totalVisits'), value: count(attendance.data?.totalVisits), tone: 'info' },
                  { label: t('attendance.uniqueMembers'), value: count(attendance.data?.uniqueMembers) },
                  {
                    label: t('attendance.averagePerDay'),
                    value: formatNumber(attendance.data?.averageVisitsPerDay ?? 0, locale, {
                      maximumFractionDigits: 1,
                    }),
                  },
                ]}
              />
              <SectionCard title={t('attendance.chartLabel')}>
                <TrendChart
                  height={300}
                  buckets={(attendance.data?.series ?? []).map((p) => p.bucket)}
                  valueFormatter={(value) => count(value ?? 0)}
                  series={[
                    {
                      key: 'visits',
                      label: t('attendance.chartLabel'),
                      color: colors.visits,
                      values: (attendance.data?.series ?? []).map((p) => p.visits),
                    },
                  ]}
                />
              </SectionCard>
            </Stack>
          )
        ) : null}

        {active === 'unpaid' ? (
          <Stack spacing={2.5}>
            <Cards
              items={[
                { label: t('unpaid.membersInDebt'), value: count(unpaid.data?.membersInDebt), tone: 'warning' },
                { label: t('unpaid.totalOutstanding'), value: money(unpaid.data?.totalOutstanding), tone: 'danger' },
              ]}
            />
            <DataTable
              rows={(unpaid.data?.balances ?? []).map((row) => ({ ...row, id: row.memberId }))}
              columns={unpaidColumns}
              loading={unpaid.isPending}
              emptyTitle={tp('outstanding.none')}
              getRowId={(row) => row.id}
              hideFooter
              minHeight={320}
            />
            <Typography variant="caption" color="text.secondary">
              {t('unpaid.cappedNotice')}
            </Typography>
          </Stack>
        ) : null}

        {active === 'trainers' ? (
          <DataTable
            rows={(trainers.data?.stats ?? []).map((row) => ({ ...row, id: row.trainerId }))}
            columns={trainerColumns}
            loading={trainers.isPending}
            emptyTitle={t('empty.title')}
            emptyBody={t('empty.body')}
            getRowId={(row) => row.id}
            hideFooter
            minHeight={320}
          />
        ) : null}
      </TabbedSection>
    </>
  );
}

function Cards({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: 'success' | 'danger' | 'warning' | 'accent' | 'info' }>;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          md: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
        },
      }}
    >
      {items.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} tone={item.tone ?? 'neutral'} />
      ))}
    </Box>
  );
}
