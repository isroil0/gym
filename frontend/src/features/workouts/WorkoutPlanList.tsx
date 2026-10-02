'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { StatusChip } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { PlanDialog } from './WorkoutDialogs';
import { useWorkoutPlanList, type WorkoutQuery } from './useWorkouts';
import type { WorkoutPlan } from '@/lib/api/types';

const DEFAULTS: WorkoutQuery = { page: '1', limit: '20', memberId: '', trainerId: '', status: '' };

/** Every programme this trainer has written. */
export function WorkoutPlanList({ basePath = '/trainer/workout-plans' }: { basePath?: string }) {
  const t = useTranslations('workouts');
  const tc = useTranslations('common');
  const router = useRouter();
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [creating, setCreating] = useState(false);

  const { data, isPending, isError, refetch } = useWorkoutPlanList(state);

  const columns = useMemo<GridColDef<WorkoutPlan>[]>(
    () => [
      {
        field: 'name',
        headerName: t('columns.name'),
        flex: 1.3,
        minWidth: 190,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.name}
            </Typography>
            {row.goal ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.goal}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'memberName',
        headerName: t('columns.member'),
        flex: 1,
        minWidth: 160,
        valueGetter: (_, row) => row.memberName ?? '—',
      },
      {
        field: 'dayCount',
        headerName: t('columns.days'),
        width: 90,
        align: 'right',
        headerAlign: 'right',
      },
      {
        field: 'exerciseCount',
        headerName: t('columns.exercises'),
        width: 110,
        align: 'right',
        headerAlign: 'right',
      },
      {
        field: 'createdAt',
        headerName: t('columns.created'),
        width: 120,
        valueGetter: (_, row) => formatDate(row.createdAt, locale),
      },
      {
        field: 'status',
        headerName: t('columns.status'),
        width: 120,
        renderCell: ({ row }) => (
          <StatusChip
            label={t(`status.${row.status}`)}
            tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
        ),
      },
    ],
    [t, locale],
  );

  const isFiltered = state.status !== '' || state.memberId !== '';

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
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
              { value: 'ACTIVE', label: t('status.ACTIVE') },
              { value: 'ARCHIVED', label: t('status.ARCHIVED') },
            ],
          },
        ]}
        onFilterChange={(key, value) => set({ [key]: value } as Partial<WorkoutQuery>)}
        onClear={clear}
      />

      <DataTable<WorkoutPlan>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        onRowClick={(row) => router.push(`${basePath}/${row.id}`)}
        emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
      />

      <PlanDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(plan) => router.push(`${basePath}/${plan.id}`)}
      />
    </>
  );
}
