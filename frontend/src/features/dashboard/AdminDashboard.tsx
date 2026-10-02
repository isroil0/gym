'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import CheckIcon from '@mui/icons-material/HowToRegOutlined';
import MoneyIcon from '@mui/icons-material/PaymentsOutlined';
import TrendingIcon from '@mui/icons-material/TrendingUpOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberRounded';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { useChartColors } from '@/components/charts/ChartTheme';
import { MetricCardSkeleton, ChartSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { ErrorState, EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatNumber } from '@/lib/format/number';
import { dateAnchors, formatDate } from '@/lib/format/datetime';
import { ExpiringList } from './ExpiringList';
import { DebtorList } from './DebtorList';
import { RecentPayments } from './RecentPayments';
import { RecentAttendance } from './RecentAttendance';
import { useTotalOutstanding } from '@/features/payments/useTotalOutstanding';
import type { AdminDashboard as AdminDashboardDto, ProfitReport, AttendanceReport } from './types';

type Window = '7' | '30' | '90';

/**
 * The gym at a glance.
 *
 * Every figure comes from the backend. The headline numbers are one call to
 * `/dashboard/admin`; the two charts come from the reporting endpoints, which
 * bucket by the gym's own timezone, so the dashboard and the reports can
 * never disagree about what "today" means.
 */
export function AdminDashboard() {
  const t = useTranslations('dashboard.admin');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();
  const colors = useChartColors();
  const [window, setWindow] = useState<Window>('30');

  const range = useMemo(() => {
    const anchors = dateAnchors();
    const from = window === '7' ? anchors.last7 : window === '30' ? anchors.last30 : shift(anchors.today, -89);
    return { from, to: anchors.today };
  }, [window]);

  const dashboard = useQuery({
    queryKey: keys.dashboards.admin,
    queryFn: () => api.get<AdminDashboardDto>('dashboard/admin'),
    refetchInterval: 120_000,
  });

  const profit = useQuery({
    queryKey: keys.reports.one('profit', range),
    queryFn: () =>
      api.get<ProfitReport>('reports/profit', { query: { ...range, groupBy: 'day' } }),
  });

  // `dashboard.totalOutstanding` sums only the five debtors the endpoint
  // fetched for its top-debtors panel, so it understates the real figure as
  // soon as a sixth member owes anything. Summed exactly instead.
  const owed = useTotalOutstanding();

  const attendance = useQuery({
    queryKey: keys.reports.one('attendance', range),
    queryFn: () =>
      api.get<AttendanceReport>('reports/attendance', { query: { ...range, groupBy: 'day' } }),
  });

  const data = dashboard.data;
  const money = (value: string | undefined) => formatMoney(value ?? null, locale);
  const count = (value: number | undefined) => formatNumber(value ?? null, locale);

  if (dashboard.isError) {
    return (
      <>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <ErrorState
          title={tc('states.errorTitle')}
          body={te('generic')}
          onRetry={() => void dashboard.refetch()}
          retryLabel={tc('actions.retry')}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={data ? `${formatDate(data.date, locale, 'long')} · ${data.timeZone}` : t('subtitle')}
        actions={
          <>
            <Button component={Link} href="/admin/members?new=1" variant="outlined" size="small">
              {t('quickActions.addMember')}
            </Button>
            <Button component={Link} href="/admin/attendance" variant="contained" size="small">
              {t('quickActions.checkIn')}
            </Button>
          </>
        }
      />

      {dashboard.isPending ? (
        <Stack spacing={2.5}>
          <MetricCardSkeleton count={4} />
          <MetricCardSkeleton count={4} />
        </Stack>
      ) : data ? (
        <Stack spacing={2.5}>
          {data.expiringSoonCount > 0 ? (
            <Alert
              severity="warning"
              variant="outlined"
              icon={<WarningIcon fontSize="small" />}
              action={
                <Button
                  component={Link}
                  href="/admin/memberships?status=ACTIVE&expiring=1"
                  size="small"
                  color="inherit"
                >
                  {t('expiringAlert.action')}
                </Button>
              }
            >
              <AlertTitle sx={{ fontSize: '0.875rem', mb: 0 }}>
                {t('expiringAlert.title')}
              </AlertTitle>
              {t('expiringAlert.body', { count: data.expiringSoonCount })}
            </Alert>
          ) : null}

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            <MetricCard
              label={t('kpi.activeMembers')}
              value={count(data.activeMembers)}
              hint={t('kpi.totalMembers') + ': ' + count(data.totalMembers)}
              tone="success"
              icon={<PeopleIcon />}
              href="/admin/members?membershipStatus=ACTIVE"
            />
            <MetricCard
              label={t('kpi.todayCheckIns')}
              value={count(data.todayCheckIns)}
              hint={`${t('kpi.currentlyInside')}: ${count(data.currentlyInside)}`}
              tone="info"
              icon={<CheckIcon />}
              href="/admin/attendance"
            />
            <MetricCard
              label={t('kpi.monthlyRevenue')}
              value={money(data.monthlyRevenue)}
              hint={data.month}
              tone="accent"
              icon={<MoneyIcon />}
              href="/admin/accounting"
            />
            <MetricCard
              label={t('kpi.monthlyProfit')}
              value={money(data.monthlyProfit)}
              hint={`${t('kpi.monthlyExpenses')}: ${money(data.monthlyExpenses)}`}
              tone={Number(data.monthlyProfit) >= 0 ? 'success' : 'danger'}
              icon={<TrendingIcon />}
              href="/admin/reports"
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            <MetricCard
              label={t('kpi.expiredMembers')}
              value={count(data.expiredMembers)}
              tone={data.expiredMembers > 0 ? 'warning' : 'neutral'}
              href="/admin/memberships?status=EXPIRED"
            />
            <MetricCard
              label={t('kpi.expiringSoon')}
              value={count(data.expiringSoonCount)}
              tone={data.expiringSoonCount > 0 ? 'warning' : 'neutral'}
            />
            <MetricCard
              label={t('kpi.totalOutstanding')}
              value={money(owed.data?.total ?? data.totalOutstanding)}
              hint={`${count(owed.data?.membersInDebt ?? data.membersInDebt)} · ${tc('labels.total')}`}
              tone={Number(owed.data?.total ?? data.totalOutstanding) > 0 ? 'danger' : 'success'}
              loading={owed.isPending}
              href="/admin/accounting?view=debts"
            />
            <MetricCard
              label={t('kpi.activeTrainers')}
              value={count(data.activeTrainers)}
              hint={`${t('kpi.newMembersThisMonth')}: ${count(data.newMembersThisMonth)}`}
              href="/admin/trainers"
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' },
            }}
          >
            <SectionCard
              title={t('charts.revenueVsExpenses')}
              action={
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={window}
                  onChange={(_, value: Window | null) => value && setWindow(value)}
                  aria-label={tc('labels.period')}
                >
                  <ToggleButton value="7" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem' }}>
                    7
                  </ToggleButton>
                  <ToggleButton value="30" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem' }}>
                    30
                  </ToggleButton>
                  <ToggleButton value="90" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem' }}>
                    90
                  </ToggleButton>
                </ToggleButtonGroup>
              }
            >
              {profit.isPending ? (
                <ChartSkeleton height={240} />
              ) : (
                <TrendChart
                  height={260}
                  variant="bar"
                  buckets={(profit.data?.series ?? []).map((point) => point.bucket)}
                  valueFormatter={(value) => formatMoney(value ?? 0, locale)}
                  series={[
                    {
                      key: 'revenue',
                      label: t('charts.revenue'),
                      color: colors.revenue,
                      values: (profit.data?.series ?? []).map((p) => Number(p.revenue)),
                    },
                    {
                      key: 'expenses',
                      label: t('charts.expenses'),
                      color: colors.expenses,
                      values: (profit.data?.series ?? []).map((p) => Number(p.expenses)),
                    },
                  ]}
                />
              )}
            </SectionCard>

            <SectionCard title={t('charts.attendanceTrend')}>
              {attendance.isPending ? (
                <ChartSkeleton height={240} />
              ) : (
                <TrendChart
                  height={260}
                  buckets={(attendance.data?.series ?? []).map((point) => point.bucket)}
                  valueFormatter={(value) => formatNumber(value ?? 0, locale)}
                  series={[
                    {
                      key: 'visits',
                      label: t('charts.checkIns'),
                      color: colors.visits,
                      values: (attendance.data?.series ?? []).map((p) => p.visits),
                    },
                  ]}
                />
              )}
            </SectionCard>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            <SectionCard title={t('expiringAlert.title')} divided dense>
              {data.expiringSoon.length === 0 ? (
                <EmptyState title={t('expiringAlert.none')} compact />
              ) : (
                <ExpiringList items={data.expiringSoon} />
              )}
            </SectionCard>

            <SectionCard title={tc('labels.total') + ' · ' + t('kpi.totalOutstanding')} divided dense>
              {data.topDebtors.length === 0 ? (
                <EmptyState title={t('kpi.totalOutstanding')} body={money('0')} compact />
              ) : (
                <DebtorList items={data.topDebtors} />
              )}
            </SectionCard>

            <SectionCard title={t('recentPayments')} divided dense>
              <RecentPayments />
            </SectionCard>

            <SectionCard title={t('recentAttendance')} divided dense>
              <RecentAttendance />
            </SectionCard>
          </Box>
        </Stack>
      ) : (
        <ListSkeleton />
      )}
    </>
  );
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
