'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import QrCodeIcon from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import { alpha } from '@mui/material/styles';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { StatusChip, MEMBERSHIP_STATUS_TONE } from '@/components/ui/StatusChip';
import { MetricCardSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { ErrorState } from '@/components/feedback/EmptyState';
import { useSession } from '@/providers/SessionProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { formatNumber } from '@/lib/format/number';
import type { MemberDashboard } from '@/features/dashboard/types';
import type { MembershipStatus } from '@/lib/api/types';

/**
 * The member's home screen, designed for a phone held in one hand on the way
 * into the gym.
 *
 * The single most useful thing here is the QR card, so it is the largest
 * target on the screen and the first thing under the status. Everything else
 * is a short answer to "am I alright?".
 */
export function MemberHome() {
  const t = useTranslations('dashboard.member');
  const tm = useTranslations('memberships');
  const tc = useTranslations('common');
  const tScan = useTranslations('attendance.selfScan');
  const te = useTranslations('errors');
  const { user } = useSession();
  const { locale } = useLocale();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: keys.dashboards.member,
    queryFn: () => api.get<MemberDashboard>('dashboard/member'),
    refetchInterval: 120_000,
  });

  if (isError) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('generic')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  if (isPending || !data) {
    return (
      <Stack spacing={2.5}>
        <MetricCardSkeleton count={2} />
        <ListSkeleton rows={4} />
      </Stack>
    );
  }

  const status = (data.membershipStatus ?? null) as MembershipStatus | null;
  const owes = Number(data.outstandingBalance ?? 0) > 0;
  const trainer = data.assignedTrainer as { name?: string; specialization?: string } | null;
  const next = data.nextSession as { startsAt?: string; trainerName?: string } | null;

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h1">{t('greeting', { name: user.firstName })}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {data.memberCode} · {formatDate(data.date, locale, 'long')}
        </Typography>
      </Box>

      {/* Membership status, told plainly. */}
      <Card
        sx={{
          borderColor: (theme) =>
            status === 'ACTIVE'
              ? alpha(theme.palette.success.main, 0.4)
              : status
                ? alpha(theme.palette.warning.main, 0.4)
                : theme.palette.divider,
        }}
      >
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {t('membershipStatus')}
              </Typography>
              <Typography variant="h3" sx={{ mt: 0.25 }}>
                {status ? tm(`status.${status}`) : tm('status.none')}
              </Typography>
              {data.membershipPlanName ? (
                <Typography variant="body2" color="text.secondary">
                  {data.membershipPlanName}
                  {data.membershipEndDate ? ` · ${formatDate(data.membershipEndDate, locale)}` : ''}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('noMembershipHint')}
                </Typography>
              )}
            </Box>
            {status ? (
              <StatusChip
                label={tm(`status.${status}`)}
                tone={MEMBERSHIP_STATUS_TONE[status] ?? 'neutral'}
              />
            ) : null}
          </Stack>

          {status === 'ACTIVE' ? (
            <Box
              sx={{
                mt: 2,
                display: 'grid',
                gap: 2,
                gridTemplateColumns: data.unlimitedVisits ? '1fr' : '1fr 1fr',
              }}
            >
              <Stat
                label={t('daysRemaining')}
                value={data.daysRemaining != null ? formatNumber(data.daysRemaining, locale) : '—'}
              />
              {!data.unlimitedVisits ? (
                <Stat
                  label={t('visitsRemaining')}
                  value={
                    data.visitsRemaining != null ? formatNumber(data.visitsRemaining, locale) : '—'
                  }
                />
              ) : (
                <Typography variant="body2" color="success.main" sx={{ fontWeight: 540 }}>
                  {t('unlimitedVisits')}
                </Typography>
              )}
            </Box>
          ) : null}
        </CardContent>
      </Card>

      {/* Getting through the door is why most members open this at all. */}
      <Stack spacing={1.5}>
        <Button
          component={Link}
          href="/me/check-in"
          variant="contained"
          size="large"
          startIcon={<QrCodeScannerIcon sx={{ fontSize: 24 }} />}
          sx={{ py: 1.75, fontSize: '1rem' }}
        >
          {tScan('button')}
        </Button>
        {/* The card stays: some gyms still scan the member rather than the
            other way round, and the backend supports both. */}
        <Button
          component={Link}
          href="/me/card"
          variant="outlined"
          size="large"
          startIcon={<QrCodeIcon sx={{ fontSize: 22 }} />}
        >
          {t('showQrCard')}
        </Button>
      </Stack>

      {owes ? (
        <Card
          component={Link}
          href="/me/payments"
          sx={{
            display: 'block',
            textDecoration: 'none',
            borderColor: (theme) => alpha(theme.palette.error.main, 0.4),
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('outstandingBalance')}
                </Typography>
                <Typography variant="h3" sx={{ color: 'error.main' }}>
                  {formatMoney(data.outstandingBalance, locale)}
                </Typography>
              </Box>
              <ChevronRightIcon sx={{ color: 'text.disabled' }} />
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <Tile
          href="/me/attendance"
          label={t('visitsThisMonth')}
          value={formatNumber(data.visitsThisMonth, locale)}
          hint={
            data.lastVisitAt
              ? `${t('lastVisit')} ${formatRelative(data.lastVisitAt, locale)}`
              : undefined
          }
        />
        <Tile
          href="/me/workout"
          label={t('workoutPlan')}
          value={data.workoutPlanName ?? '—'}
          hint={data.workoutPlanName ? undefined : t('noWorkoutPlan')}
          small
        />
        <Tile
          href="/me/trainer"
          label={t('assignedTrainer')}
          value={trainer?.name ?? '—'}
          hint={trainer?.name ? trainer.specialization ?? undefined : t('noTrainer')}
          small
        />
        <Tile
          href="/me/membership"
          label={t('nextSession')}
          value={next?.startsAt ? formatDateTime(next.startsAt, locale) : '—'}
          hint={next?.startsAt ? (next.trainerName ?? undefined) : t('noNextSession')}
          small
        />
      </Box>

      {data.currentlyInside ? (
        <Card sx={{ borderColor: (theme) => alpha(theme.palette.success.main, 0.4) }}>
          <CardContent sx={{ py: 1.75 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <LinearProgress
                color="success"
                sx={{ width: 36, borderRadius: 1 }}
                variant="indeterminate"
              />
              <Typography variant="body2" sx={{ fontWeight: 540, color: 'success.main' }}>
                {t('recentActivity')}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h3" className="tabular">
        {value}
      </Typography>
    </Box>
  );
}

function Tile({
  href,
  label,
  value,
  hint,
  small = false,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <Card component={Link} href={href} sx={{ display: 'block', textDecoration: 'none' }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {label}
            </Typography>
            <Typography
              variant={small ? 'h5' : 'h3'}
              className={small ? undefined : 'tabular'}
              noWrap
              sx={{ mt: 0.25 }}
            >
              {value}
            </Typography>
            {hint ? (
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {hint}
              </Typography>
            ) : null}
          </Box>
          <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
        </Stack>
      </CardContent>
    </Card>
  );
}
