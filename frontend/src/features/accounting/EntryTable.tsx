'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/BlockOutlined';
import type { GridColDef } from '@mui/x-data-grid';
import { DataTable } from '@/components/data/DataTable';
import { StatusChip, ENTRY_TYPE_TONE } from '@/components/ui/StatusChip';
import { VoidEntryDialog } from './VoidEntryDialog';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { useEntryList, type EntryQuery } from './useAccounting';
import type { AccountingEntry } from '@/lib/api/types';

/** Ledger entries, filtered by whatever the caller cares about. */
export function EntryTable({
  query,
  onPageChange,
  onPageSizeChange,
  emptyTitle,
}: {
  query: Partial<EntryQuery>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
  emptyTitle: string;
}) {
  const t = useTranslations('accounting');
  const tc = useTranslations('common');
  const tp = useTranslations('payments');
  const { locale } = useLocale();
  const [voiding, setVoiding] = useState<AccountingEntry | null>(null);

  const { data, isPending, isError, refetch } = useEntryList(query);

  const columns = useMemo<GridColDef<AccountingEntry>[]>(
    () => [
      {
        field: 'occurredOn',
        headerName: t('entries.columns.date'),
        width: 112,
        valueGetter: (_, row) => formatDate(row.occurredOn, locale),
      },
      {
        field: 'type',
        headerName: t('entries.columns.type'),
        width: 118,
        renderCell: ({ row }) => (
          <StatusChip
            label={t(`entryType.${row.type}`)}
            tone={ENTRY_TYPE_TONE[row.type as keyof typeof ENTRY_TYPE_TONE] ?? 'neutral'}
          />
        ),
      },
      {
        field: 'description',
        headerName: t('entries.columns.description'),
        flex: 1.4,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography
              variant="body2"
              noWrap
              sx={{ textDecoration: row.voided ? 'line-through' : 'none' }}
            >
              {row.description}
            </Typography>
            {row.trainerName ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.trainerName}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'category',
        headerName: t('entries.columns.category'),
        flex: 0.9,
        minWidth: 140,
        valueGetter: (_, row) =>
          row.expenseCategoryName ??
          (row.incomeSource ? t(`incomeSource.${row.incomeSource}`) : '—'),
      },
      {
        field: 'amount',
        headerName: t('entries.columns.amount'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Typography
            variant="body2"
            className="tabular"
            sx={{
              fontWeight: 540,
              color: row.voided ? 'text.disabled' : row.type === 'EXPENSE' ? 'error.main' : 'success.main',
              textDecoration: row.voided ? 'line-through' : 'none',
            }}
          >
            {row.type === 'EXPENSE' ? '−' : ''}
            {formatMoney(row.amount, locale)}
          </Typography>
        ),
      },
      {
        field: 'method',
        headerName: t('entries.columns.method'),
        width: 120,
        valueGetter: (_, row) => (row.method ? tp(`method.${row.method}`) : '—'),
      },
      {
        field: 'source',
        headerName: t('entries.columns.source'),
        width: 120,
        renderCell: ({ row }) => (
          <Tooltip title={row.isAutomatic ? t('entries.automaticHint') : ''}>
            <Chip
              size="small"
              variant="outlined"
              label={row.isAutomatic ? t('entries.automatic') : t('entries.manual')}
            />
          </Tooltip>
        ),
      },
      {
        field: 'actions',
        headerName: tc('labels.actions'),
        width: 70,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) =>
          row.voided ? (
            <Typography variant="caption" color="text.disabled">
              {t('entries.voided')}
            </Typography>
          ) : (
            // Automatic entries mirror a payment; the backend refuses to void
            // them, so the control is disabled with the reason attached
            // rather than left to fail.
            <Tooltip title={row.isAutomatic ? t('entries.void.notAllowed') : t('entries.void.confirm')}>
              <span>
                <IconButton
                  size="small"
                  disabled={row.isAutomatic}
                  onClick={() => setVoiding(row)}
                  aria-label={t('entries.void.confirm')}
                >
                  <BlockIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </span>
            </Tooltip>
          ),
      },
    ],
    [t, tc, tp, locale],
  );

  return (
    <>
      <DataTable<AccountingEntry>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        emptyTitle={emptyTitle}
        getRowId={(row) => row.id}
        minHeight={380}
      />
      {voiding ? (
        <VoidEntryDialog open entry={voiding} onClose={() => setVoiding(null)} />
      ) : null}
    </>
  );
}
