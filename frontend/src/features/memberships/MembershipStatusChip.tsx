'use client';

import { useTranslations } from 'next-intl';
import Tooltip from '@mui/material/Tooltip';
import { StatusChip, MEMBERSHIP_STATUS_TONE } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import type { Membership, MembershipStatus } from '@/lib/api/types';

/**
 * A membership's status with the one fact that makes it actionable:
 * how long is left, or when it stopped.
 */
export function MembershipStatusChip({
  membership,
  withHint = false,
}: {
  membership: Pick<
    Membership,
    'status' | 'daysRemaining' | 'startDate' | 'endDate' | 'frozenAt' | 'cancelledAt'
  >;
  withHint?: boolean;
}) {
  const t = useTranslations('memberships');
  const { locale } = useLocale();
  const status = membership.status as MembershipStatus;

  const hint = (() => {
    switch (status) {
      case 'PENDING':
        return t('statusHint.PENDING', { date: formatDate(membership.startDate, locale) });
      case 'ACTIVE':
        // daysRemaining is null while frozen; ACTIVE always has a number.
        return membership.daysRemaining !== null && membership.daysRemaining !== undefined
          ? t('statusHint.ACTIVE', { count: membership.daysRemaining, date: '' })
          : '';
      case 'FROZEN':
        return membership.frozenAt
          ? t('statusHint.FROZEN', { date: formatDate(membership.frozenAt, locale) })
          : '';
      case 'EXPIRED':
        return t('statusHint.EXPIRED', { date: formatDate(membership.endDate, locale) });
      case 'CANCELLED':
        return membership.cancelledAt
          ? t('statusHint.CANCELLED', { date: formatDate(membership.cancelledAt, locale) })
          : '';
      default:
        return '';
    }
  })();

  const chip = (
    <StatusChip label={t(`status.${status}`)} tone={MEMBERSHIP_STATUS_TONE[status] ?? 'neutral'} />
  );

  if (!hint) return chip;
  if (!withHint) return <Tooltip title={hint}>{chip}</Tooltip>;

  return (
    <Tooltip title={hint}>
      <span>
        <StatusChip
          label={`${t(`status.${status}`)} · ${hint}`}
          tone={MEMBERSHIP_STATUS_TONE[status] ?? 'neutral'}
        />
      </span>
    </Tooltip>
  );
}
