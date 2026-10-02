'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { SearchField } from '@/components/data/SearchField';
import { FilterBar } from '@/components/data/FilterBar';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { useMemberList, type MemberQuery } from '@/features/members/useMembers';
import type { Member } from '@/lib/api/types';

const DEFAULTS: MemberQuery = {
  page: '1',
  limit: '20',
  search: '',
  status: '',
  gender: '',
  assignedTrainerId: '',
  unassigned: '',
};

/**
 * The members this trainer coaches.
 *
 * No trainer filter is offered because the backend already scopes
 * `GET /members` to the caller's own members — a trainer cannot see anybody
 * else's, whatever this page asks for.
 */
export function TrainerMembers() {
  const t = useTranslations('members');
  const tn = useTranslations('navigation');
  const tc = useTranslations('common');
  const router = useRouter();
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);

  const { data, isPending, isFetching, isError, refetch } = useMemberList(state);

  const columns = useMemo<GridColDef<Member>[]>(
    () => [
      {
        field: 'name',
        headerName: t('columns.name'),
        flex: 1.5,
        minWidth: 200,
        valueGetter: (_, row) => `${row.account.firstName} ${row.account.lastName}`,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
            <Avatar sx={{ width: 28, height: 28, fontSize: '0.6875rem' }}>
              {(row.account.firstName[0] ?? '') + (row.account.lastName[0] ?? '')}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {row.account.firstName} {row.account.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {row.memberCode}
              </Typography>
            </Box>
          </Stack>
        ),
      },
      {
        field: 'phone',
        headerName: t('columns.phone'),
        flex: 0.9,
        minWidth: 140,
        valueGetter: (_, row) => row.account.phone ?? '—',
      },
      {
        field: 'joinedAt',
        headerName: t('columns.joined'),
        width: 130,
        valueGetter: (_, row) => formatDate(row.joinedAt, locale),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader title={tn('myMembers')} subtitle={t('subtitle')} />

      <FilterBar
        search={
          <SearchField
            value={state.search}
            onChange={(value) => set({ search: value })}
            placeholder={t('searchPlaceholder')}
            loading={isFetching && !isPending}
          />
        }
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
        onRowClick={(row) => router.push(`/trainer/members/${row.id}`)}
        emptyTitle={state.search ? t('empty.filtered') : t('empty.title')}
        emptyBody={state.search ? tc('states.noResultsHint') : undefined}
        filtered={Boolean(state.search)}
        getRowId={(row) => row.id}
      />
    </>
  );
}
