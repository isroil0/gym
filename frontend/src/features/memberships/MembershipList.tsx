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
import { TabbedSection } from '@/components/ui/TabbedSection';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate, dateAnchors } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { MembershipStatusChip } from './MembershipStatusChip';
import { SellMembershipDialog } from './SellMembershipDialog';
import { PlanList } from './PlanList';
import { useMembershipList, usePlans, type MembershipQuery } from './useMemberships';
import { MEMBERSHIP_STATUSES, type Membership } from '@/lib/api/types';

const DEFAULTS: MembershipQuery = {
  page: '1',
  limit: '20',
  memberId: '',
  planId: '',
  status: '',
  endingBefore: '',
  endingAfter: '',
};

/** Every membership the gym has sold, and the plans it sells them from. */
export function MembershipList({ tab = 'memberships' }: { tab?: string }) {
  const t = useTranslations('memberships');
  const tc = useTranslations('common');
  const router = useRouter();
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [selling, setSelling] = useState(false);

  const { data, isPending, isError, refetch } = useMembershipList(state);
  const plans = usePlans({ status: 'ACTIVE' });

  const columns = useMemo<GridColDef<Membership>[]>(
    () => [
      {
        field: 'member',
        headerName: t('columns.member'),
        flex: 1.3,
        minWidth: 190,
        valueGetter: (_, row) =>
          row.member ? `${row.member.firstName} ${row.member.lastName}` : '—',
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
              {row.member ? `${row.member.firstName} ${row.member.lastName}` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.member?.memberCode}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'plan',
        headerName: t('columns.plan'),
        flex: 1,
        minWidth: 150,
        valueGetter: (_, row) => row.plan.name,
      },
      {
        field: 'startDate',
        headerName: t('columns.startDate'),
        width: 112,
        valueGetter: (_, row) => formatDate(row.startDate, locale),
      },
      {
        field: 'endDate',
        headerName: t('columns.endDate'),
        width: 112,
        valueGetter: (_, row) => formatDate(row.endDate, locale),
      },
      {
        field: 'amountDue',
        headerName: t('columns.price'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Stack sx={{ justifyContent: 'center', height: '100%', alignItems: 'flex-end' }}>
            <Typography variant="body2" className="tabular">
              {formatMoney(row.amountDue, locale)}
            </Typography>
            {Number(row.discountAmount) > 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                className="tabular"
                sx={{ textDecoration: 'line-through' }}
              >
                {formatMoney(row.purchasePrice, locale)}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'status',
        headerName: t('columns.status'),
        width: 150,
        renderCell: ({ row }) => <MembershipStatusChip membership={row} />,
      },
    ],
    [t, locale],
  );

  const filters = [
    {
      key: 'status',
      label: t('columns.status'),
      value: state.status,
      options: [
        { value: '', label: tc('labels.all') },
        ...MEMBERSHIP_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) })),
      ],
    },
    {
      key: 'planId',
      label: t('columns.plan'),
      value: state.planId,
      options: [
        { value: '', label: tc('labels.all') },
        ...(plans.data?.data ?? []).map((plan) => ({ value: plan.id, label: plan.name })),
      ],
    },
    {
      key: 'endingBefore',
      label: t('columns.endDate'),
      value: state.endingBefore,
      options: [
        { value: '', label: tc('labels.all') },
        { value: dateAnchors().today, label: tc('periods.today') },
        { value: shift(dateAnchors().today, 7), label: tc('periods.last7Days') },
        { value: shift(dateAnchors().today, 30), label: tc('periods.last30Days') },
      ],
    },
  ];

  const isFiltered = Object.entries(state).some(
    ([key, value]) => value !== DEFAULTS[key as keyof MembershipQuery],
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setSelling(true)}>
            {t('sell.title')}
          </Button>
        }
      />

      <TabbedSection
        tabs={[
          { value: 'memberships', label: t('title') },
          { value: 'plans', label: t('plans.title') },
        ]}
        active={tab}
        param="view"
      >
        {tab === 'plans' ? (
          <PlanList />
        ) : (
          <>
            <FilterBar
              filters={filters}
              onFilterChange={(key, value) => set({ [key]: value } as Partial<MembershipQuery>)}
              onClear={clear}
            />
            <DataTable<Membership>
              rows={data?.data ?? []}
              columns={columns}
              meta={data?.meta}
              loading={isPending}
              error={isError ? new Error('failed') : null}
              onRetry={() => void refetch()}
              onPageChange={(page) => set({ page: String(page) })}
              onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
              onRowClick={(row) =>
                row.member ? router.push(`/admin/members/${row.member.id}?tab=membership`) : undefined
              }
              emptyTitle={isFiltered ? t('empty.filtered') : t('empty.title')}
              emptyBody={isFiltered ? tc('states.noResultsHint') : t('empty.body')}
              filtered={isFiltered}
              getRowId={(row) => row.id}
            />
          </>
        )}
      </TabbedSection>

      <SellMembershipDialog open={selling} onClose={() => setSelling(false)} />
    </>
  );
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
