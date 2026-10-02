'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { StatusChip, BILLING_STATUS_TONE, PAYMENT_STATUS_TONE } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatDate, formatDateTime } from '@/lib/format/datetime';
import { TakePaymentDialog } from '@/features/payments/TakePaymentDialog';
import { PaymentDetailDrawer } from '@/features/payments/PaymentDetailDrawer';
import { useMemberBilling, usePaymentList } from '@/features/payments/usePayments';
import type { Member, Payment } from '@/lib/api/types';

/** What this member has been charged, has paid, and still owes. */
export function MemberPaymentsTab({ member }: { member: Member }) {
  const t = useTranslations('payments');
  const { locale } = useLocale();
  const [taking, setTaking] = useState(false);
  const [viewing, setViewing] = useState<Payment | null>(null);

  const billing = useMemberBilling(member.id);
  const payments = usePaymentList({ memberId: member.id, limit: '50', page: '1' });

  const owes = Number(billing.data?.outstanding ?? 0) > 0;

  return (
    <Stack spacing={2.5}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.5}
            sx={{ mb: 2.5 }}
          >
            <Typography variant="h4">{t('billing.title')}</Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 17 }} />}
              onClick={() => setTaking(true)}
              disabled={member.status === 'ARCHIVED'}
            >
              {t('create')}
            </Button>
          </Stack>

          {billing.isPending ? (
            <ListSkeleton rows={2} />
          ) : billing.data ? (
            <>
              <DefinitionList
                columns={4}
                items={[
                  { label: t('billing.amountDue'), value: formatMoney(billing.data.amountDue, locale) },
                  { label: t('billing.netPaid'), value: formatMoney(billing.data.netPaid, locale) },
                  {
                    label: t('billing.outstanding'),
                    value: (
                      <Typography
                        component="span"
                        variant="body2"
                        className="tabular"
                        sx={{ fontWeight: 580, color: owes ? 'error.main' : 'success.main' }}
                      >
                        {formatMoney(billing.data.outstanding, locale)}
                      </Typography>
                    ),
                  },
                  {
                    label: t('billing.credit'),
                    value: formatMoney(billing.data.credit, locale),
                  },
                ]}
              />

              {billing.data.memberships.length > 0 ? (
                <Stack component="ul" sx={{ listStyle: 'none', m: 0, mt: 2.5, p: 0 }}>
                  {billing.data.memberships.map((balance) => (
                    <Box
                      component="li"
                      key={balance.membershipId}
                      sx={{
                        py: 1.25,
                        '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="center">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                            {balance.planName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(balance.startDate, locale)} – {formatDate(balance.endDate, locale)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" className="tabular">
                            {formatMoney(balance.outstanding, locale)}
                          </Typography>
                          <StatusChip
                            label={t(`billingStatus.${balance.settlementStatus}`)}
                            tone={
                              BILLING_STATUS_TONE[
                                balance.settlementStatus as keyof typeof BILLING_STATUS_TONE
                              ] ?? 'neutral'
                            }
                          />
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1.5 }}>
            {t('history')}
          </Typography>

          {payments.isPending ? (
            <ListSkeleton rows={4} />
          ) : (payments.data?.data.length ?? 0) === 0 ? (
            <EmptyState title={t('noPayments')} compact />
          ) : (
            <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {payments.data!.data.map((payment) => (
                <Box
                  component="li"
                  key={payment.id}
                  sx={{ '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}
                >
                  <Stack
                    component="button"
                    type="button"
                    onClick={() => setViewing(payment)}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={1.5}
                    sx={{
                      width: '100%',
                      py: 1.25,
                      px: 1,
                      mx: -1,
                      border: 'none',
                      bgcolor: 'transparent',
                      font: 'inherit',
                      textAlign: 'start',
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                        {formatMoney(payment.amount, locale)} · {t(`method.${payment.method}`)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(payment.paidAt, locale)}
                        {payment.membershipPlanName ? ` · ${payment.membershipPlanName}` : ''}
                      </Typography>
                    </Box>
                    <StatusChip
                      label={t(`status.${payment.status}`)}
                      tone={
                        PAYMENT_STATUS_TONE[payment.status as keyof typeof PAYMENT_STATUS_TONE] ??
                        'neutral'
                      }
                    />
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <TakePaymentDialog open={taking} member={member} onClose={() => setTaking(false)} />
      <PaymentDetailDrawer payment={viewing} onClose={() => setViewing(null)} />
    </Stack>
  );
}
