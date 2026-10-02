'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { StatusChip } from '@/components/ui/StatusChip';
import { MetricCardSkeleton } from '@/components/feedback/Skeletons';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatDateTime, formatDuration, formatTime } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import { CheckInDesk } from './CheckInDesk';
import { useAttendanceList, useCheckOutVisit, useTodayAttendance } from './useAttendance';
import { ATTENDANCE_METHODS, type Attendance } from '@/lib/api/types';

const DEFAULTS = { page: '1', limit: '20', memberId: '', method: '', from: '', to: '' };

/** The front desk, plus the record of who has been in. */
export function AttendancePage({ tab = 'today' }: { tab?: string }) {
  const t = useTranslations('attendance');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();
  const { state, set, clear } = useQueryState(DEFAULTS);

  const today = useTodayAttendance();
  const history = useAttendanceList(state);
  const checkOut = useCheckOutVisit();

  const columns = useMemo<GridColDef<Attendance>[]>(
    () => [
      {
        field: 'member',
        headerName: t('columns.member'),
        flex: 1.2,
        minWidth: 180,
        valueGetter: (_, row) => row.memberName ?? '—',
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.memberName ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.memberCode}
              {row.membershipPlanName ? ` · ${row.membershipPlanName}` : ''}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'checkedInAt',
        headerName: t('columns.checkedInAt'),
        width: 150,
        valueGetter: (_, row) => formatDateTime(row.checkedInAt, locale),
      },
      {
        field: 'checkedOutAt',
        headerName: t('columns.checkedOutAt'),
        width: 120,
        renderCell: ({ row }) =>
          row.stillInside ? (
            <StatusChip label={t('stillInside')} tone="success" />
          ) : (
            <Typography variant="body2">{formatTime(row.checkedOutAt, locale)}</Typography>
          ),
      },
      {
        field: 'durationMinutes',
        headerName: t('columns.duration'),
        width: 110,
        valueGetter: (_, row) =>
          row.durationMinutes != null ? formatDuration(row.durationMinutes, locale) : '—',
      },
      {
        field: 'method',
        headerName: t('columns.method'),
        width: 110,
        valueGetter: (_, row) => t(`method.${row.method}`),
      },
      {
        field: 'actions',
        headerName: '',
        width: 60,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) =>
          row.stillInside ? (
            <Tooltip title={t('checkOut.button')}>
              <IconButton
                size="small"
                aria-label={t('checkOut.button')}
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await checkOut.mutateAsync(row.id);
                    toast.success(
                      t('checkOut.success', { name: row.memberName ?? row.memberCode ?? '' }),
                    );
                  } catch (error) {
                    toast.error(describe(error));
                  }
                }}
              >
                <LogoutIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          ) : null,
      },
    ],
    [t, locale, checkOut, toast, describe],
  );

  const isFiltered = Object.entries(state).some(
    ([key, value]) => value !== DEFAULTS[key as keyof typeof DEFAULTS],
  );

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <TabbedSection
        tabs={[
          { value: 'today', label: t('today') },
          { value: 'history', label: t('history') },
        ]}
        active={tab}
        param="view"
      >
        {tab === 'history' ? (
          <>
            <FilterBar
              filters={[
                {
                  key: 'method',
                  label: t('columns.method'),
                  value: state.method,
                  options: [
                    { value: '', label: tc('labels.all') },
                    ...ATTENDANCE_METHODS.map((m) => ({ value: m, label: t(`method.${m}`) })),
                  ],
                },
              ]}
              onFilterChange={(key, value) => set({ [key]: value })}
              onClear={clear}
            >
              <DateRangePicker
                value={{ from: state.from, to: state.to }}
                onChange={(range) => set({ from: range.from, to: range.to })}
              />
            </FilterBar>

            <DataTable<Attendance>
              rows={history.data?.data ?? []}
              columns={columns}
              meta={history.data?.meta}
              loading={history.isPending}
              error={history.isError ? new Error('failed') : null}
              onRetry={() => void history.refetch()}
              onPageChange={(page) => set({ page: String(page) })}
              onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
              emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
              emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
              filtered={isFiltered}
              getRowId={(row) => row.id}
            />
          </>
        ) : (
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(2, minmax(0, 240px))' },
              }}
            >
              {today.isPending ? (
                <MetricCardSkeleton count={2} />
              ) : (
                <>
                  <MetricCard
                    label={t('stats.totalVisits')}
                    value={formatNumber(today.data?.totalVisits ?? 0, locale)}
                    tone="info"
                  />
                  <MetricCard
                    label={t('stats.currentlyInside')}
                    value={formatNumber(today.data?.currentlyInside ?? 0, locale)}
                    tone={(today.data?.currentlyInside ?? 0) > 0 ? 'success' : 'neutral'}
                  />
                </>
              )}
            </Box>

            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' } }}>
              <CheckInDesk />

              <SectionCard title={t('today')} divided dense>
                <DataTable<Attendance>
                  rows={today.data?.visits ?? []}
                  columns={columns}
                  loading={today.isPending}
                  error={today.isError ? new Error('failed') : null}
                  onRetry={() => void today.refetch()}
                  emptyTitle={t('empty.today')}
                  getRowId={(row) => row.id}
                  hideFooter
                  minHeight={340}
                />
              </SectionCard>
            </Box>
          </Stack>
        )}
      </TabbedSection>
    </>
  );
}
