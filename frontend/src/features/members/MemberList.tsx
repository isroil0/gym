'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AddIcon from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { SearchField } from '@/components/data/SearchField';
import { FilterBar } from '@/components/data/FilterBar';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { MemberFormDialog } from './MemberFormDialog';
import { useMemberList, type MemberQuery } from './useMembers';
import type { Member, Paginated, Trainer } from '@/lib/api/types';

const DEFAULTS: MemberQuery = {
  page: '1',
  limit: '20',
  search: '',
  status: '',
  gender: '',
  assignedTrainerId: '',
  unassigned: '',
};

/** The member directory. Everything that narrows the list lives in the URL. */
export function MemberList({ openNew = false }: { openNew?: boolean }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const router = useRouter();
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [creating, setCreating] = useState(openNew);

  const { data, isPending, isFetching, isError, refetch } = useMemberList(state);

  // Only active trainers can be assigned, so only they belong in the filter.
  const trainers = useQuery({
    queryKey: keys.trainers.list({ limit: 100, status: 'ACTIVE' }),
    queryFn: () =>
      api.get<Paginated<Trainer>>('trainers', { query: { limit: 100, status: 'ACTIVE' } }),
    staleTime: 5 * 60_000,
  });

  const columns = useMemo<GridColDef<Member>[]>(
    () => [
      {
        field: 'memberCode',
        headerName: t('columns.code'),
        width: 108,
        renderCell: ({ row }) => (
          <Typography variant="body2" className="mono" sx={{ color: 'text.secondary' }}>
            {row.memberCode}
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
        field: 'phone',
        headerName: t('columns.phone'),
        flex: 0.8,
        minWidth: 130,
        valueGetter: (_, row) => row.account.phone ?? '—',
      },
      {
        field: 'trainer',
        headerName: t('columns.trainer'),
        flex: 1,
        minWidth: 150,
        valueGetter: (_, row) =>
          row.assignedTrainer
            ? `${row.assignedTrainer.firstName} ${row.assignedTrainer.lastName}`
            : '—',
        renderCell: ({ row }) =>
          row.assignedTrainer ? (
            <Typography variant="body2" noWrap>
              {row.assignedTrainer.firstName} {row.assignedTrainer.lastName}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">
              —
            </Typography>
          ),
      },
      {
        field: 'joinedAt',
        headerName: t('columns.joined'),
        width: 118,
        valueGetter: (_, row) => formatDate(row.joinedAt, locale),
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
      label: t('filters.status'),
      value: state.status,
      options: [
        { value: '', label: tc('labels.all') },
        { value: 'ACTIVE', label: tc('accountStatus.ACTIVE') },
        { value: 'ARCHIVED', label: tc('accountStatus.ARCHIVED') },
      ],
    },
    {
      key: 'assignedTrainerId',
      label: t('filters.trainer'),
      value: state.assignedTrainerId,
      options: [
        { value: '', label: tc('labels.all') },
        ...(trainers.data?.data ?? []).map((trainer) => ({
          value: trainer.id,
          label: `${trainer.account.firstName} ${trainer.account.lastName}`,
        })),
      ],
    },
    {
      key: 'unassigned',
      label: t('filters.unassigned'),
      value: state.unassigned,
      options: [
        { value: '', label: tc('labels.all') },
        { value: 'true', label: tc('labels.yes') },
      ],
    },
    {
      key: 'gender',
      label: tc('labels.gender'),
      value: state.gender,
      options: [
        { value: '', label: tc('labels.all') },
        { value: 'MALE', label: tc('gender.MALE') },
        { value: 'FEMALE', label: tc('gender.FEMALE') },
        { value: 'OTHER', label: tc('gender.OTHER') },
        { value: 'PREFER_NOT_TO_SAY', label: tc('gender.PREFER_NOT_TO_SAY') },
      ],
    },
  ];

  const isFiltered = Object.entries(state).some(
    ([key, value]) => value !== DEFAULTS[key as keyof MemberQuery],
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreating(true)}
            size="small"
          >
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
        onFilterChange={(key, value) => set({ [key]: value } as Partial<MemberQuery>)}
        onClear={clear}
      />

      <DataTable<Member>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        onRowClick={(row) => router.push(`/admin/members/${row.id}`)}
        emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
      />

      <MemberFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(member) => {
          setCreating(false);
          router.push(`/admin/members/${member.id}`);
        }}
      />
    </>
  );
}
