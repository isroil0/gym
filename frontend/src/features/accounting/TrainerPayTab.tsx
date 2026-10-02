'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { DataTable } from '@/components/data/DataTable';
import { SectionCard } from '@/components/ui/SectionCard';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatNumber, formatPercent } from '@/lib/format/number';
import { useTrainerList } from '@/features/trainers/useTrainers';
import { ExpenseDialog } from './ExpenseDialog';
import { EntryTable } from './EntryTable';
import { dateAnchors } from '@/lib/format/datetime';
import type { Trainer } from '@/lib/api/types';

const QUERY = { page: '1', limit: '100', search: '', status: 'ACTIVE' };

/**
 * What each trainer is set up to earn, and what has actually been paid out.
 *
 * The backend stores a compensation arrangement per trainer and lets an
 * expense be attributed to one, so both halves are real. What it does not do
 * is calculate a payroll run — that is stated plainly rather than implied by
 * a page that looks like it does.
 */
export function TrainerPayTab() {
  const t = useTranslations('accounting.salaries');
  const tt = useTranslations('trainers');
  const { locale } = useLocale();
  const [paying, setPaying] = useState<Trainer | null>(null);
  const [page, setPage] = useState(1);

  const { data, isPending, isError, refetch } = useTrainerList(QUERY);
  const anchors = dateAnchors();

  const columns = useMemo<GridColDef<Trainer>[]>(
    () => [
      {
        field: 'trainer',
        headerName: t('columns.trainer'),
        flex: 1.2,
        minWidth: 180,
        valueGetter: (_, row) => `${row.account.firstName} ${row.account.lastName}`,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.account.firstName} {row.account.lastName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.trainerCode}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'compensationType',
        headerName: t('columns.type'),
        width: 180,
        valueGetter: (_, row) =>
          row.compensationType && row.compensationType !== 'NONE'
            ? tt(`compensation.types.${row.compensationType}`)
            : t('notConfigured'),
      },
      {
        field: 'monthlySalary',
        headerName: t('columns.baseSalary'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => (row.monthlySalary ? formatMoney(row.monthlySalary, locale) : '—'),
      },
      {
        field: 'commissionRate',
        headerName: t('columns.commission'),
        width: 120,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) =>
          row.commissionRate ? formatPercent(row.commissionRate, locale) : '—',
      },
      {
        field: 'assignedMemberCount',
        headerName: t('columns.assignedMembers'),
        width: 110,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_, row) => formatNumber(row.assignedMemberCount, locale),
      },
      {
        field: 'actions',
        headerName: '',
        width: 150,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />} onClick={() => setPaying(row)}>
            {t('recordPayment')}
          </Button>
        ),
      },
    ],
    [t, tt, locale],
  );

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" variant="outlined">
        {t('gapNotice')}
      </Alert>

      <DataTable<Trainer>
        rows={data?.data ?? []}
        columns={columns}
        meta={data?.meta}
        loading={isPending}
        error={isError ? new Error('failed') : null}
        onRetry={() => void refetch()}
        onPageChange={setPage}
        onPageSizeChange={() => setPage(1)}
        emptyTitle={t('empty')}
        getRowId={(row) => row.id}
        minHeight={300}
      />

      <SectionCard title={t('paidOut')} subtitle={t('paidOutHint')} divided dense>
        <Box sx={{ mt: -1 }}>
          <EntryTable
            query={{
              page: String(page),
              limit: '10',
              type: 'EXPENSE',
              from: anchors.yearStart,
              to: anchors.today,
            }}
            onPageChange={setPage}
            onPageSizeChange={() => setPage(1)}
            emptyTitle={t('noPayments')}
          />
        </Box>
      </SectionCard>

      {paying ? (
        <ExpenseDialog
          open
          onClose={() => setPaying(null)}
          trainerId={paying.id}
          trainerName={`${paying.account.firstName} ${paying.account.lastName}`}
        />
      ) : null}
    </Stack>
  );
}
