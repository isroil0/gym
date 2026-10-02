'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import DoneIcon from '@mui/icons-material/CheckRounded';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import CloseIcon from '@mui/icons-material/CloseRounded';
import PersonOffIcon from '@mui/icons-material/PersonOffOutlined';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { StatusChip, SESSION_STATUS_TONE } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime, formatDuration } from '@/lib/format/datetime';
import {
  CancelSessionDialog,
  CompleteSessionDialog,
  NoShowDialog,
  SessionDialog,
} from './SessionDialogs';
import { useSessionList } from './useSessions';
import { SESSION_STATUSES, type SessionStatus, type TrainingSession } from '@/lib/api/types';

const DEFAULTS = {
  page: '1',
  limit: '20',
  memberId: '',
  trainerId: '',
  status: '',
  from: '',
  to: '',
};

/**
 * One-to-one sessions.
 *
 * Which actions a row offers depends on its state, because the backend
 * refuses the rest: a completed session cannot be cancelled, and a cancelled
 * one is final.
 */
export function SessionsPage({ trainerId }: { trainerId?: string }) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);

  const [booking, setBooking] = useState(false);
  const [acting, setActing] = useState<{ kind: string; session: TrainingSession } | null>(null);

  const query = { ...state, ...(trainerId ? { trainerId } : {}) };
  const { data, isPending, isError, refetch } = useSessionList(query);

  const columns = useMemo<GridColDef<TrainingSession>[]>(
    () => [
      {
        field: 'startsAt',
        headerName: t('columns.startsAt'),
        width: 160,
        valueGetter: (_, row) => formatDateTime(row.startsAt, locale),
      },
      {
        field: 'member',
        headerName: t('columns.member'),
        flex: 1.2,
        minWidth: 170,
        valueGetter: (_, row) => row.memberName ?? '—',
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.memberName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.memberCode}
              {row.location ? ` · ${row.location}` : ''}
            </Typography>
          </Stack>
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
        field: 'status',
        headerName: t('columns.status'),
        width: 140,
        renderCell: ({ row }) => (
          <StatusChip
            label={t(`status.${row.status}`)}
            tone={SESSION_STATUS_TONE[row.status as SessionStatus] ?? 'neutral'}
          />
        ),
      },
      {
        field: 'actions',
        headerName: tc('labels.actions'),
        width: 160,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) =>
          row.status === 'SCHEDULED' ? (
            <Stack direction="row" spacing={0.25}>
              <Tooltip title={t('actions.complete')}>
                <IconButton size="small" onClick={() => setActing({ kind: 'complete', session: row })} aria-label={t('actions.complete')}>
                  <DoneIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('actions.reschedule')}>
                <IconButton size="small" onClick={() => setActing({ kind: 'reschedule', session: row })} aria-label={t('actions.reschedule')}>
                  <ScheduleIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('actions.noShow')}>
                <IconButton size="small" onClick={() => setActing({ kind: 'noshow', session: row })} aria-label={t('actions.noShow')}>
                  <PersonOffIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('actions.cancel')}>
                <IconButton size="small" onClick={() => setActing({ kind: 'cancel', session: row })} aria-label={t('actions.cancel')}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : null,
      },
    ],
    [t, tc, locale],
  );

  const isFiltered = Object.entries(state).some(
    ([key, value]) => value !== DEFAULTS[key as keyof typeof DEFAULTS],
  );
  const close = () => setActing(null);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setBooking(true)}>
            {t('create')}
          </Button>
        }
      />

      <FilterBar
        filters={[
          {
            key: 'status',
            label: t('columns.status'),
            value: state.status,
            options: [
              { value: '', label: tc('labels.all') },
              ...SESSION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
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

      <DataTable<TrainingSession>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
      />

      <SessionDialog open={booking} trainerId={trainerId} onClose={() => setBooking(false)} />
      {acting?.kind === 'reschedule' ? (
        <SessionDialog open session={acting.session} onClose={close} />
      ) : null}
      {acting?.kind === 'complete' ? (
        <CompleteSessionDialog open session={acting.session} onClose={close} />
      ) : null}
      {acting?.kind === 'cancel' ? (
        <CancelSessionDialog open session={acting.session} onClose={close} />
      ) : null}
      {acting?.kind === 'noshow' ? (
        <NoShowDialog open session={acting.session} onClose={close} />
      ) : null}
    </>
  );
}
