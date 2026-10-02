'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { DataTable } from '@/components/data/DataTable';
import { MetricCard } from '@/components/ui/MetricCard';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatNumber } from '@/lib/format/number';
import { useOutstandingBalances, type MemberBilling } from '@/features/payments/usePayments';
import { useTotalOutstanding } from '@/features/payments/useTotalOutstanding';
import Box from '@mui/material/Box';

const DEFAULTS = { page: '1', limit: '20', minimumBalance: '' };

/** Who owes the gym money, and how much. */
export function DebtsTab() {
  const t = useTranslations('payments.outstanding');
  const tp = useTranslations('payments');
  const { locale } = useLocale();
  const { state, set } = useQueryState(DEFAULTS);

  const { data, isPending, isError, refetch } = useOutstandingBalances(state);

  // Summed across every page, not just the one on screen.
  const owed = useTotalOutstanding();
  const total = owed.data?.total ?? '0.00';

  const columns = useMemo<GridColDef<MemberBilling>[]>(
    () => [
      {
        field: 'memberName',
        headerName: tp('columns.member'),
        flex: 1.3,
        minWidth: 190,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.memberName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.memberCode}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'amountDue',
        headerName: tp('billing.amountDue'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.amountDue, locale),
      },
      {
        field: 'netPaid',
        headerName: tp('billing.netPaid'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatMoney(row.netPaid, locale),
      },
      {
        field: 'outstanding',
        headerName: tp('billing.outstanding'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Typography variant="body2" className="tabular" sx={{ fontWeight: 580, color: 'error.main' }}>
            {formatMoney(row.outstanding, locale)}
          </Typography>
        ),
      },
    ],
    [tp, locale],
  );

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          maxWidth: 520,
        }}
      >
        <MetricCard
          label={t('membersInDebt', { count: owed.data?.membersInDebt ?? 0 })}
          value={formatNumber(owed.data?.membersInDebt ?? 0, locale)}
          tone={(owed.data?.membersInDebt ?? 0) > 0 ? 'warning' : 'success'}
          loading={owed.isPending}
        />
        <MetricCard
          label={t('total')}
          value={formatMoney(total, locale)}
          tone={Number(total) > 0 ? 'danger' : 'success'}
          hint={tp('outstanding.subtitle')}
          loading={owed.isPending}
        />
      </Box>

      <DataTable<MemberBilling>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={(page) => set({ page: String(page) })}
        onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
        emptyTitle={t('none')}
        getRowId={(row) => row.memberId}
      />
    </Stack>
  );
}
