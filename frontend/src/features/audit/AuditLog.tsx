'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { DataTable } from '@/components/data/DataTable';
import { FilterBar } from '@/components/data/FilterBar';
import { DateRangePicker } from '@/components/data/DateRangePicker';
import { SectionCard } from '@/components/ui/SectionCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import { USER_ROLES, type Paginated, type Schemas } from '@/lib/api/types';

type AuditEntry = Schemas['AuditLogResponseDto'];
type PermissionAudit = Schemas['PermissionAuditDto'];

const DEFAULTS = {
  page: '1',
  limit: '25',
  actorRole: '',
  outcome: '',
  entityType: '',
  from: '',
  to: '',
};

/**
 * Who did what.
 *
 * The backend records every request, including the ones its guards refused,
 * so a refusal is as visible here as a success. That is the point of an
 * audit trail — the interesting entries are usually the failures.
 */
export function AuditLog() {
  const t = useTranslations('settings.audit');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const { state, set, clear } = useQueryState(DEFAULTS);

  const params = {
    page: Number(state.page) || 1,
    limit: Number(state.limit) || 25,
    actorRole: state.actorRole || undefined,
    outcome: state.outcome || undefined,
    entityType: state.entityType || undefined,
    from: state.from || undefined,
    to: state.to || undefined,
  };

  const logs = useQuery({
    queryKey: keys.audit.logs(params),
    queryFn: () => api.get<Paginated<AuditEntry>>('audit/logs', { query: params }),
    placeholderData: (previous) => previous,
  });

  const permissions = useQuery({
    queryKey: keys.audit.permissions,
    queryFn: () => api.get<PermissionAudit>('audit/permissions'),
    staleTime: 10 * 60_000,
  });

  const columns = useMemo<GridColDef<AuditEntry>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: t('columns.when'),
        width: 160,
        valueGetter: (_, row) => formatDateTime(row.createdAt, locale),
      },
      {
        field: 'actor',
        headerName: t('columns.actor'),
        flex: 1,
        minWidth: 170,
        valueGetter: (_, row) => row.actorEmail ?? '—',
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap>
              {row.actorEmail ?? '—'}
            </Typography>
            {row.actorRole ? (
              <Typography variant="caption" color="text.secondary">
                {tc(`role.${row.actorRole}`)}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'action',
        headerName: t('columns.action'),
        flex: 1.1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" noWrap className="mono" sx={{ fontSize: '0.78125rem' }}>
              {row.action}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.method} {row.path}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'entityType',
        headerName: t('columns.entity'),
        width: 130,
        valueGetter: (_, row) => row.entityType ?? '—',
      },
      {
        field: 'outcome',
        headerName: t('columns.outcome'),
        width: 130,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <StatusChip
              label={t(`outcome.${row.outcome}`)}
              tone={row.outcome === 'SUCCESS' ? 'success' : 'danger'}
            />
            {row.statusCode ? (
              <Typography variant="caption" color="text.secondary" className="tabular">
                {row.statusCode}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: 'ipAddress',
        headerName: t('columns.ip'),
        width: 130,
        valueGetter: (_, row) => row.ipAddress ?? '—',
      },
    ],
    [t, tc, locale],
  );

  const audit = permissions.data;
  const allCovered = audit ? audit.unrestricted === 0 && (audit.needsReview?.length ?? 0) === 0 : false;

  return (
    <Stack spacing={2.5}>
      <SectionCard title={t('permissions.title')} subtitle={t('permissions.subtitle')} divided dense>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          <MetricCard
            label={t('permissions.totalRoutes')}
            value={formatNumber(audit?.totalRoutes ?? null, locale)}
            loading={permissions.isPending}
          />
          <MetricCard
            label={t('permissions.publicRoutes')}
            value={formatNumber(audit?.publicRoutes ?? null, locale)}
            tone="info"
            loading={permissions.isPending}
          />
          <MetricCard
            label={t('permissions.unrestricted')}
            value={formatNumber(audit?.unrestricted ?? null, locale)}
            tone={allCovered ? 'success' : 'danger'}
            loading={permissions.isPending}
          />
        </Box>
        {allCovered ? (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }}>
            {t('permissions.allCovered')}
          </Alert>
        ) : audit && (audit.needsReview?.length ?? 0) > 0 ? (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {audit.needsReview!.map((route) => (
                <Chip key={String(route)} size="small" label={String(route)} variant="outlined" />
              ))}
            </Stack>
          </Alert>
        ) : null}
      </SectionCard>

      <Box>
        <FilterBar
          filters={[
            {
              key: 'actorRole',
              label: t('filters.actor'),
              value: state.actorRole,
              options: [
                { value: '', label: tc('labels.all') },
                ...USER_ROLES.map((role) => ({ value: role, label: tc(`role.${role}`) })),
              ],
            },
            {
              key: 'outcome',
              label: t('filters.outcome'),
              value: state.outcome,
              options: [
                { value: '', label: tc('labels.all') },
                { value: 'SUCCESS', label: t('outcome.SUCCESS') },
                { value: 'FAILURE', label: t('outcome.FAILURE') },
              ],
            },
          ]}
          onFilterChange={(key, value) => set({ [key]: value })}
          onClear={clear}
        >
          <DateRangePicker
            value={{ from: state.from, to: state.to }}
            onChange={(range) => set({ from: range.from, to: range.to })}
          />
        </FilterBar>

        <DataTable<AuditEntry>
          rows={logs.data?.data ?? []}
          columns={columns}
          meta={logs.data?.meta}
          loading={logs.isPending}
          error={logs.isError ? new Error('failed') : null}
          onRetry={() => void logs.refetch()}
          onPageChange={(page) => set({ page: String(page) })}
          onPageSizeChange={(limit) => set({ limit: String(limit), page: '1' })}
          emptyTitle={t('empty')}
          getRowId={(row) => row.id}
        />
      </Box>
    </Stack>
  );
}
