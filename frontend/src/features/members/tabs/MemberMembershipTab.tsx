'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import AcUnitIcon from '@mui/icons-material/AcUnitOutlined';
import PlayIcon from '@mui/icons-material/PlayArrowRounded';
import AutorenewIcon from '@mui/icons-material/AutorenewRounded';
import MoreTimeIcon from '@mui/icons-material/MoreTimeOutlined';
import DiscountIcon from '@mui/icons-material/LocalOfferOutlined';
import CancelIcon from '@mui/icons-material/CancelOutlined';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { MembershipStatusChip } from '@/features/memberships/MembershipStatusChip';
import { SellMembershipDialog } from '@/features/memberships/SellMembershipDialog';
import {
  CancelDialog,
  DiscountDialog,
  ExtendDialog,
  FreezeDialog,
  RenewDialog,
  UnfreezeDialog,
} from '@/features/memberships/MembershipActions';
import { useMembershipList } from '@/features/memberships/useMemberships';
import type { Member, Membership } from '@/lib/api/types';

const LIVE = ['PENDING', 'ACTIVE', 'FROZEN'];

/**
 * A member's memberships: the one that governs them today, then the history.
 *
 * Which actions appear depends on the membership's state, because the
 * backend refuses the rest: you cannot freeze what is already frozen, and a
 * cancelled term is final.
 */
export function MemberMembershipTab({ member }: { member: Member }) {
  const t = useTranslations('memberships');
  const tm = useTranslations('members');
  const { locale } = useLocale();

  const [selling, setSelling] = useState(false);
  const [acting, setActing] = useState<{ kind: string; membership: Membership } | null>(null);

  const { data, isPending } = useMembershipList({
    memberId: member.id,
    limit: '50',
    page: '1',
  });

  if (isPending) return <ListSkeleton rows={3} />;

  const all = data?.data ?? [];
  const current = all.find((m) => LIVE.includes(m.status as string)) ?? null;
  const history = all.filter((m) => m.id !== current?.id);
  const archived = member.status === 'ARCHIVED';

  const close = () => setActing(null);

  return (
    <Stack spacing={2.5}>
      {current ? (
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1.5}
              sx={{ mb: 2.5 }}
            >
              <Box>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Typography variant="h4">{current.plan.name}</Typography>
                  <MembershipStatusChip membership={current} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {formatDate(current.startDate, locale, 'long')} –{' '}
                  {formatDate(current.endDate, locale, 'long')}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                {current.status === 'FROZEN' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PlayIcon sx={{ fontSize: 17 }} />}
                    onClick={() => setActing({ kind: 'unfreeze', membership: current })}
                  >
                    {t('unfreeze.confirm')}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AcUnitIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setActing({ kind: 'freeze', membership: current })}
                    disabled={archived || current.status === 'PENDING'}
                  >
                    {t('freeze.confirm')}
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutorenewIcon sx={{ fontSize: 17 }} />}
                  onClick={() => setActing({ kind: 'renew', membership: current })}
                  disabled={archived}
                >
                  {t('renew.confirm')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<MoreTimeIcon sx={{ fontSize: 17 }} />}
                  onClick={() => setActing({ kind: 'extend', membership: current })}
                  disabled={archived}
                >
                  {t('extend.confirm')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DiscountIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setActing({ kind: 'discount', membership: current })}
                  disabled={archived}
                >
                  {t('discount.confirm')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<CancelIcon sx={{ fontSize: 17 }} />}
                  onClick={() => setActing({ kind: 'cancel', membership: current })}
                  disabled={archived}
                >
                  {t('cancel.confirm')}
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ mb: 2.5 }} />

            <DefinitionList
              columns={4}
              items={[
                {
                  label: t('columns.daysRemaining'),
                  value:
                    current.daysRemaining === null || current.daysRemaining === undefined
                      ? '—'
                      : String(current.daysRemaining),
                },
                { label: t('fields.purchasePrice'), value: formatMoney(current.purchasePrice, locale) },
                {
                  label: t('fields.discount'),
                  value: Number(current.discountAmount) > 0 ? formatMoney(current.discountAmount, locale) : '—',
                },
                { label: t('columns.due'), value: formatMoney(current.amountDue, locale) },
              ]}
            />

            <Box sx={{ mt: 2.5 }}>
              {current.unlimitedVisits ? (
                <Typography variant="body2" color="text.secondary">
                  {t('visits.unlimited')}
                </Typography>
              ) : (
                <>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('visits.used', { used: current.visitsUsed, total: current.visitLimit ?? 0 })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('visits.remaining', { count: current.visitsRemaining ?? 0 })}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={
                      current.visitLimit
                        ? Math.min(100, (current.visitsUsed / current.visitLimit) * 100)
                        : 0
                    }
                  />
                </>
              )}
            </Box>

            {current.totalFrozenDays > 0 || current.extendedDays > 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                {current.totalFrozenDays > 0
                  ? t('frozenDays', { count: current.totalFrozenDays })
                  : ''}
                {current.totalFrozenDays > 0 && current.extendedDays > 0 ? ' · ' : ''}
                {current.extendedDays > 0 ? `+${current.extendedDays}` : ''}
              </Typography>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              title={tm('detail.noMembership')}
              body={t('empty.body')}
              action={
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setSelling(true)}
                  disabled={archived}
                >
                  {tm('actions.sellMembership')}
                </Button>
              }
            />
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
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                        {membership.plan.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(membership.startDate, locale)} –{' '}
                        {formatDate(membership.endDate, locale)}
                        {membership.previousMembershipId ? ` · ${t('renewedFrom')}` : ''}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Typography variant="body2" className="tabular">
                        {formatMoney(membership.amountDue, locale)}
                      </Typography>
                      <MembershipStatusChip membership={membership} />
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <SellMembershipDialog open={selling} member={member} onClose={() => setSelling(false)} />

      {acting?.kind === 'freeze' ? (
        <FreezeDialog open membership={acting.membership} onClose={close} />
      ) : null}
      {acting?.kind === 'unfreeze' ? (
        <UnfreezeDialog open membership={acting.membership} onClose={close} />
      ) : null}
      {acting?.kind === 'renew' ? (
        <RenewDialog open membership={acting.membership} onClose={close} />
      ) : null}
      {acting?.kind === 'extend' ? (
        <ExtendDialog open membership={acting.membership} onClose={close} />
      ) : null}
      {acting?.kind === 'discount' ? (
        <DiscountDialog open membership={acting.membership} onClose={close} />
      ) : null}
      {acting?.kind === 'cancel' ? (
        <CancelDialog open membership={acting.membership} onClose={close} />
      ) : null}
    </Stack>
  );
}
