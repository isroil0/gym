'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import EventIcon from '@mui/icons-material/EventNoteOutlined';
import ListAltIcon from '@mui/icons-material/ListAltOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAllRounded';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { MetricCardSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { StatusChip, MEMBERSHIP_STATUS_TONE, SESSION_STATUS_TONE } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate, formatRelative, formatTime } from '@/lib/format/datetime';
import { formatNumber } from '@/lib/format/number';
import type { TrainerDashboard as TrainerDashboardDto } from './types';
import type { MembershipStatus, SessionStatus } from '@/lib/api/types';

/** A trainer's day: who they coach, what is booked, and who has gone quiet. */
export function TrainerDashboard() {
  const t = useTranslations('dashboard.trainer');
  const ts = useTranslations('sessions');
  const tm = useTranslations('memberships');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: keys.dashboards.trainer,
    queryFn: () => api.get<TrainerDashboardDto>('dashboard/trainer'),
    refetchInterval: 120_000,
  });

  if (isError) {
    return (
      <>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <ErrorState
          title={tc('states.errorTitle')}
          body={te('generic')}
          onRetry={() => void refetch()}
          retryLabel={tc('actions.retry')}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={data ? `${formatDate(data.date, locale, 'long')} · ${data.trainerCode}` : t('subtitle')}
      />

      {isPending || !data ? (
        <Stack spacing={2.5}>
          <MetricCardSkeleton count={4} />
          <ListSkeleton rows={5} />
        </Stack>
      ) : (
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
            }}
          >
            <MetricCard
              label={t('kpi.assignedMembers')}
              value={formatNumber(data.assignedMembers, locale)}
              hint={`${t('kpi.activeMembers')}: ${formatNumber(data.assignedMembersActive, locale)}`}
              icon={<PeopleIcon />}
              tone="accent"
              href="/trainer/members"
            />
            <MetricCard
              label={t('kpi.sessionsToday')}
              value={formatNumber(data.sessionsToday.length, locale)}
              icon={<EventIcon />}
              tone="info"
              href="/trainer/sessions"
            />
            <MetricCard
              label={t('kpi.activeWorkoutPlans')}
              value={formatNumber(data.activeWorkoutPlans, locale)}
              icon={<ListAltIcon />}
              href="/trainer/workout-plans"
            />
            <MetricCard
              label={t('kpi.completedThisMonth')}
              value={formatNumber(data.sessionsCompletedThisMonth, locale)}
              hint={`${ts('status.NO_SHOW')}: ${formatNumber(data.noShowsThisMonth, locale)}`}
              icon={<DoneAllIcon />}
              tone="success"
            />
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
            <SectionCard title={t('todaySessions')} divided dense>
              {data.sessionsToday.length === 0 ? (
                <EmptyState title={t('noSessionsToday')} compact />
              ) : (
                <SessionLines sessions={data.sessionsToday} />
              )}
            </SectionCard>

            <SectionCard title={t('upcomingSessions')} divided dense>
              {data.upcomingSessions.length === 0 ? (
                <EmptyState title={ts('empty.upcoming')} compact />
              ) : (
                <SessionLines sessions={data.upcomingSessions} withDate />
              )}
            </SectionCard>
          </Box>

          <SectionCard title={t('memberActivity')} divided dense>
            {data.memberActivity.length === 0 ? (
              <EmptyState title={t('noMembers')} compact />
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {data.memberActivity.map((member) => (
                  <Box
                    component="li"
                    key={member.memberId}
                    sx={{ '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}
                  >
                    <Stack
                      component={Link}
                      href={`/trainer/members/${member.memberId}`}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1.5}
                      sx={{
                        py: 1.25,
                        px: 1,
                        mx: -1,
                        borderRadius: 1,
                        textDecoration: 'none',
                        color: 'inherit',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                            {member.memberName}
                          </Typography>
                          {member.needsAttention ? (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={formatNumber(member.daysSinceLastVisit ?? 0, locale)}
                              sx={{ height: 18, fontSize: '0.6875rem' }}
                            />
                          ) : null}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {member.memberCode} ·{' '}
                          {member.lastVisitAt
                            ? `${t('lastVisit')} ${formatRelative(member.lastVisitAt, locale)}`
                            : t('lastVisit') + ' —'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Typography variant="caption" color="text.secondary" className="tabular">
                          {formatNumber(member.visitsThisMonth, locale)}
                        </Typography>
                        <StatusChip
                          label={tm(`status.${member.membershipStatus ?? 'EXPIRED'}`)}
                          tone={
                            MEMBERSHIP_STATUS_TONE[
                              (member.membershipStatus ?? 'EXPIRED') as MembershipStatus
                            ] ?? 'neutral'
                          }
                        />
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        </Stack>
      )}
    </>
  );
}

function SessionLines({
  sessions,
  withDate = false,
}: {
  sessions: TrainerDashboardDto['sessionsToday'];
  withDate?: boolean;
}) {
  const ts = useTranslations('sessions');
  const { locale } = useLocale();

  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {sessions.map((session) => (
        <Box
          component="li"
          key={session.sessionId}
          sx={{
            py: 1.25,
            '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {session.memberName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {withDate ? `${formatDate(session.startsAt, locale)} · ` : ''}
                {formatTime(session.startsAt, locale)} – {formatTime(session.endsAt, locale)}
                {session.location ? ` · ${session.location}` : ''}
              </Typography>
            </Box>
            <StatusChip
              label={ts(`status.${session.status}`)}
              tone={SESSION_STATUS_TONE[session.status as SessionStatus] ?? 'neutral'}
            />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
