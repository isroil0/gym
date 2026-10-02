'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { StatusChip, PAYMENT_STATUS_TONE } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { TakePaymentDialog } from './TakePaymentDialog';
import { PaymentDetailDrawer } from './PaymentDetailDrawer';
import { usePaymentList, type PaymentQuery } from './usePayments';
import { PAYMENT_METHODS, PAYMENT_STATUSES, type Payment } from '@/lib/api/types';

const DEFAULTS: PaymentQuery = {
  page: '1',
  limit: '20',
  memberId: '',
  membershipId: '',
  method: '',
  status: '',
  from: '',
  to: '',
};

/** Money taken in. */
export function PaymentList() {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [taking, setTaking] = useState(false);
  const [viewing, setViewing] = useState<Payment | null>(null);

  const { data, isPending, isError, refetch } = usePaymentList(state);

  const columns = useMemo<GridColDef<Payment>[]>(
    () => [
      {
        field: 'paidAt',
        headerName: t('columns.date'),
        width: 150,
        valueGetter: (_, row) => formatDateTime(row.paidAt, locale),
      },
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
        field: 'amount',
        headerName: t('columns.amount'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Stack sx={{ justifyContent: 'center', height: '100%', alignItems: 'flex-end' }}>
            <Typography variant="body2" className="tabular" sx={{ fontWeight: 560 }}>
              {formatMoney(row.amount, locale)}
            </Typography>
            {Number(row.refundedAmount) > 0 ? (
              <Typography variant="caption" color="error.main" className="tabular">
                −{formatMoney(row.refundedAmount, locale)}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'method',
        headerName: t('columns.method'),
        width: 130,
        valueGetter: (_, row) => t(`method.${row.method}`),
      },
      {
        field: 'status',
        headerName: t('columns.status'),
        width: 150,
        renderCell: ({ row }) => (
          <StatusChip
            label={t(`status.${row.status}`)}
            tone={PAYMENT_STATUS_TONE[row.status as keyof typeof PAYMENT_STATUS_TONE] ?? 'neutral'}
          />
        ),
      },
      {
        field: 'recordedBy',
        headerName: t('columns.receivedBy'),
        flex: 0.8,
        minWidth: 130,
        valueGetter: (_, row) => row.recordedBy ?? '—',
      },
    ],
    [t, locale],
  );

  const filters = [
    {
      key: 'method',
      label: t('columns.method'),
      value: state.method,
      options: [
        { value: '', label: tc('labels.all') },
        ...PAYMENT_METHODS.map((m) => ({ value: m, label: t(`method.${m}`) })),
      ],
    },
    {
      key: 'status',
      label: t('columns.status'),
      value: state.status,
      options: [
        { value: '', label: tc('labels.all') },
        ...PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
      ],
    },
  ];

  const isFiltered = Object.entries(state).some(
    ([key, value]) => value !== DEFAULTS[key as keyof PaymentQuery],
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setTaking(true)}>
            {t('create')}
          </Button>
        }
      />

      <FilterBar
        filters={filters}
        onFilterChange={(key, value) => set({ [key]: value } as Partial<PaymentQuery>)}
        onClear={clear}
      >
        <DateRangePicker
          value={{ from: state.from, to: state.to }}
          onChange={(range) => set({ from: range.from, to: range.to })}
        />
      </FilterBar>

      <DataTable<Payment>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        onRowClick={(row) => setViewing(row)}
        emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
        emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
        filtered={isFiltered}
        getRowId={(row) => row.id}
      />

      <TakePaymentDialog open={taking} onClose={() => setTaking(false)} />
      <PaymentDetailDrawer payment={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
