'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/EditOutlined';
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import type { GridColDef } from '@mui/x-data-grid';
import { DataTable } from '@/components/data/DataTable';
import { SearchField } from '@/components/data/SearchField';
import { FilterBar } from '@/components/data/FilterBar';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatMoney } from '@/lib/format/money';
import { formatNumber } from '@/lib/format/number';
import { PlanFormDialog } from './PlanFormDialog';
import { useArchivePlan, usePlanList } from './useMemberships';
import type { MembershipPlan } from '@/lib/api/types';

const DEFAULTS = { page: '1', limit: '20', search: '', status: '' };

/** What the gym sells. */
export function PlanList() {
  const t = useTranslations('memberships.plans');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();
  const { state, set, clear } = useQueryState(DEFAULTS);

  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<MembershipPlan | null>(null);

  const { data, isPending, isFetching, isError, refetch } = usePlanList(state);
  const archive = useArchivePlan(archiving?.id ?? '');

  const columns = useMemo<GridColDef<MembershipPlan>[]>(
    () => [
      {
        field: 'name',
        headerName: t('columns.name'),
        flex: 1.4,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.name}
            </Typography>
            {row.description ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.description}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'durationDays',
        headerName: t('columns.duration'),
        width: 110,
        valueGetter: (_, row) => t('durationDays', { count: row.durationDays }),
      },
      {
        field: 'price',
        headerName: t('columns.price'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Typography variant="body2" className="tabular" sx={{ fontWeight: 540 }}>
            {formatMoney(row.price, locale)}
          </Typography>
        ),
      },
      {
        field: 'visitLimit',
        headerName: t('columns.visits'),
        width: 110,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) =>
          row.unlimitedVisits ? t('unlimited') : formatNumber(row.visitLimit ?? 0, locale),
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
      {
        field: 'actions',
        headerName: tc('labels.actions'),
        width: 96,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.25}>
            <Tooltip title={tc('actions.edit')}>
              <IconButton size="small" onClick={() => setEditing(row)}>
                <EditIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={row.status === 'ARCHIVED' ? tc('actions.reactivate') : tc('actions.archive')}>
              <IconButton size="small" onClick={() => setArchiving(row)}>
                {row.status === 'ARCHIVED' ? (
                  <RestoreIcon sx={{ fontSize: 17 }} />
                ) : (
                  <ArchiveIcon sx={{ fontSize: 17 }} />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [t, tc, locale],
  );

  const isFiltered = state.search !== '' || state.status !== '';
  const archived = archiving?.status === 'ARCHIVED';

  return (
    <>
      <FilterBar
        search={
          <SearchField
            value={state.search}
            onChange={(value) => set({ search: value })}
            loading={isFetching && !isPending}
          />
        }
        filters={[
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
        ]}
        onFilterChange={(key, value) => set({ [key]: value })}
        onClear={clear}
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            {t('create')}
          </Button>
        }
      />

      <DataTable<MembershipPlan>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        emptyTitle={isFiltered ? tc('states.noResults') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
        minHeight={360}
      />

      <PlanFormDialog open={creating} onClose={() => setCreating(false)} />
      <PlanFormDialog open={Boolean(editing)} plan={editing ?? undefined} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archived ? t('reactivate.title') : t('archive.title')}
        body={
          archiving
            ? archived
              ? t('reactivate.body', { name: archiving.name })
              : t('archive.body', { name: archiving.name })
            : ''
        }
        confirmLabel={archived ? t('reactivate.confirm') : t('archive.confirm')}
        tone={archived ? 'default' : 'danger'}
        busy={archive.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={async () => {
          try {
            await archive.mutateAsync(!archived);
            toast.success(archived ? t('reactivate.success') : t('archive.success'));
            setArchiving(null);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />
    </>
  );
}
