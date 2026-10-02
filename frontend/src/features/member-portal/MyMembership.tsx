'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { StatusChip, MEMBERSHIP_STATUS_TONE } from '@/components/ui/StatusChip';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import { MembershipStatusChip } from '@/features/memberships/MembershipStatusChip';
import type { Membership, Schemas } from '@/lib/api/types';

type OwnMemberships = Schemas['OwnMembershipsDto'];

/** The member's own membership: current term and everything before it. */
export function MyMembership() {
  const t = useTranslations('memberships');
  const tn = useTranslations('navigation');
  const { locale } = useLocale();

  // `GET /memberships/me` is not a paginated list: it answers with the term
  // that governs the member today and everything before it, already
  // separated. Treating it as a page returns nothing at all.
  const { data, isPending } = useQuery({
    queryKey: keys.memberships.me,
    queryFn: () => api.get<OwnMemberships>('memberships/me'),
  });

  if (isPending) return <DetailSkeleton />;

  const current = (data?.current ?? null) as Membership | null;
  const history = data?.history ?? [];

  return (
    <>
      <PageHeader title={tn('myMembership')} />
      <Stack spacing={2.5}>
        {current ? (
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h3">{current.plan.name}</Typography>
                <MembershipStatusChip membership={current} />
              </Stack>
              <DefinitionList
                columns={2}
                items={[
                  { label: t('columns.startDate'), value: formatDate(current.startDate, locale, 'long') },
                  { label: t('columns.endDate'), value: formatDate(current.endDate, locale, 'long') },
                  {
                    label: t('columns.daysRemaining'),
                    value:
                      current.daysRemaining != null ? formatNumber(current.daysRemaining, locale) : '—',
                  },
                  {
                    label: t('columns.visits'),
                    value: current.unlimitedVisits
                      ? t('visits.unlimited')
                      : t('visits.used', { used: current.visitsUsed, total: current.visitLimit ?? 0 }),
                  },
                ]}
              />
              {!current.unlimitedVisits && current.visitLimit ? (
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (current.visitsUsed / current.visitLimit) * 100)}
                  sx={{ mt: 2 }}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <EmptyState title={t('status.none')} body={t('empty.body')} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h5" sx={{ mb: 1.5 }}>
              {t('history')}
            </Typography>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                {t('noHistory')}
              </Typography>
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {history.map((membership) => (
                  <Box
                    component="li"
                    key={membership.id}
                    sx={{
                      py: 1.25,
                      '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                          {membership.plan.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(membership.startDate, locale)} –{' '}
                          {formatDate(membership.endDate, locale)}
                        </Typography>
                      </Box>
                      <StatusChip
                        label={t(`status.${membership.status}`)}
                        tone={
                          MEMBERSHIP_STATUS_TONE[
                            membership.status as keyof typeof MEMBERSHIP_STATUS_TONE
                          ] ?? 'neutral'
                        }
                      />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
