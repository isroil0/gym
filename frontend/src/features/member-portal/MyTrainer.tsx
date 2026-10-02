'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip, SESSION_STATUS_TONE } from '@/components/ui/StatusChip';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime, formatDuration } from '@/lib/format/datetime';
import { useMySessions } from '@/features/sessions/useSessions';
import type { SessionStatus } from '@/lib/api/types';
import type { MemberDashboard } from '@/features/dashboard/types';

/** Who coaches this member, and what is booked with them. */
export function MyTrainer() {
  const t = useTranslations('dashboard.member');
  const tn = useTranslations('navigation');
  const ts = useTranslations('sessions');
  const { locale } = useLocale();

  const dashboard = useQuery({
    queryKey: keys.dashboards.member,
    queryFn: () => api.get<MemberDashboard>('dashboard/member'),
  });
  const sessions = useMySessions({ limit: '20' });

  const trainer = dashboard.data?.assignedTrainer as
    | { name?: string; specialization?: string; trainerCode?: string }
    | null
    | undefined;

  return (
    <>
      <PageHeader title={tn('myTrainer')} />
      <Stack spacing={2.5}>
        {dashboard.isPending ? (
          <ListSkeleton rows={2} />
        ) : trainer?.name ? (
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontSize: '1.1rem' }}>
                  {trainer.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </Avatar>
                <Box>
                  <Typography variant="h3">{trainer.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[trainer.trainerCode, trainer.specialization].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <EmptyState title={t('noTrainer')} body={t('noMembershipHint')} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h5" sx={{ mb: 1.5 }}>
              {ts('title')}
            </Typography>
            {sessions.isPending ? (
              <ListSkeleton rows={3} />
            ) : (sessions.data?.data.length ?? 0) === 0 ? (
              <EmptyState title={ts('empty.member')} compact />
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {sessions.data!.data.map((session) => (
                  <Box
                    component="li"
                    key={session.id}
                    sx={{
                      py: 1.25,
                      '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 540 }}>
                          {formatDateTime(session.startsAt, locale)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDuration(session.durationMinutes ?? null, locale)}
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
            )}
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
