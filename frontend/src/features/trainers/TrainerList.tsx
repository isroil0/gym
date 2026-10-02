'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { SearchField } from '@/components/data/SearchField';
import { FilterBar } from '@/components/data/FilterBar';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import { TrainerFormDialog } from './TrainerFormDialog';
import { useTrainerList, type TrainerQuery } from './useTrainers';
import type { Trainer } from '@/lib/api/types';

const DEFAULTS: TrainerQuery = { page: '1', limit: '20', search: '', status: '' };

/** The coaching staff. */
export function TrainerList() {
  const t = useTranslations('trainers');
  const tc = useTranslations('common');
  const router = useRouter();
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [creating, setCreating] = useState(false);

  const { data, isPending, isFetching, isError, refetch } = useTrainerList(state);

  const columns = useMemo<GridColDef<Trainer>[]>(
    () => [
      {
        field: 'trainerCode',
        headerName: t('columns.code'),
        width: 104,
        renderCell: ({ row }) => (
          <Typography variant="body2" className="mono" sx={{ color: 'text.secondary' }}>
            {row.trainerCode}
          </Typography>
        ),
      },
      {
        field: 'name',
        headerName: t('columns.name'),
        flex: 1.4,
        minWidth: 200,
        valueGetter: (_, row) => `${row.account.firstName} ${row.account.lastName}`,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
            <Avatar sx={{ width: 26, height: 26, fontSize: '0.6875rem' }}>
              {(row.account.firstName[0] ?? '') + (row.account.lastName[0] ?? '')}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {row.account.firstName} {row.account.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {row.account.email}
              </Typography>
            </Box>
          </Stack>
        ),
      },
      {
        field: 'specialization',
        headerName: t('columns.specialization'),
        flex: 1,
        minWidth: 150,
        valueGetter: (_, row) => row.specialization ?? '—',
      },
      {
        field: 'assignedMemberCount',
        headerName: t('columns.members'),
        width: 100,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Typography variant="body2" className="tabular">
            {formatNumber(row.assignedMemberCount, locale)}
          </Typography>
        ),
      },
      {
        field: 'hiredAt',
        headerName: t('columns.hiredAt'),
        width: 118,
        valueGetter: (_, row) => (row.hiredAt ? formatDate(row.hiredAt, locale) : '—'),
      },
      {
        field: 'status',
        headerName: t('columns.status'),
        width: 118,
        renderCell: ({ row }) => (
          <StatusChip
            label={tc(`accountStatus.${row.status}`)}
            tone={ACCOUNT_STATUS_TONE[row.status as keyof typeof ACCOUNT_STATUS_TONE] ?? 'neutral'}
          />
        ),
      },
    ],
    [t, tc, locale],
  );

  const filters = [
    {
      key: 'status',
      label: t('columns.status'),
      value: state.status,
      options: [
        { value: '', label: tc('labels.all') },
        { value: 'ACTIVE', label: tc('accountStatus.ACTIVE') },
        { value: 'ARCHIVED', label: tc('accountStatus.ARCHIVED') },
      ],
    },
  ];

  const isFiltered = state.search !== '' || state.status !== '';

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} size="small">
            {t('create')}
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchField
            value={state.search}
            onChange={(value) => set({ search: value })}
            placeholder={t('searchPlaceholder')}
            loading={isFetching && !isPending}
          />
        }
        filters={filters}
        onFilterChange={(key, value) => set({ [key]: value } as Partial<TrainerQuery>)}
        onClear={clear}
      />

      <DataTable<Trainer>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        onRowClick={(row) => router.push(`/admin/trainers/${row.id}`)}
        emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
      />

      <TrainerFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(trainer) => {
          setCreating(false);
          router.push(`/admin/trainers/${trainer.id}`);
        }}
      />
    </>
  );
}
