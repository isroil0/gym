'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { StatusChip, PAYMENT_STATUS_TONE } from '@/components/ui/StatusChip';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import type { Paginated, Payment } from '@/lib/api/types';
import type { MemberBilling } from '@/features/payments/usePayments';

/** The member's own payments and what they owe. */
export function MyPayments() {
  const t = useTranslations('payments');
  const { locale } = useLocale();

  const billing = useQuery({
    queryKey: keys.billing.me,
    queryFn: () => api.get<MemberBilling>('billing/me'),
  });
  const payments = useQuery({
    queryKey: keys.payments.me,
    queryFn: () => api.get<Paginated<Payment>>('payments/me', { query: { limit: 50 } }),
  });

  const owes = Number(billing.data?.outstanding ?? 0) > 0;

  return (
    <>
      <PageHeader title={t('title')} />
      <Stack spacing={2.5}>
        <Card>
          <CardContent>
            {billing.isPending ? (
              <ListSkeleton rows={2} />
            ) : billing.data ? (
              <>
                <Typography variant="caption" color="text.secondary">
                  {t('billing.outstanding')}
                </Typography>
                <Typography variant="h1" sx={{ color: owes ? 'error.main' : 'success.main', mb: 1.5 }}>
                  {formatMoney(billing.data.outstanding, locale)}
                </Typography>
                {!owes ? (
                  <Typography variant="body2" color="success.main" sx={{ mb: 1.5 }}>
                    {t('billing.settled')}
                  </Typography>
                ) : null}
                <Divider sx={{ mb: 2 }} />
                <DefinitionList
                  columns={2}
                  items={[
                    { label: t('billing.amountDue'), value: formatMoney(billing.data.amountDue, locale) },
                    { label: t('billing.netPaid'), value: formatMoney(billing.data.netPaid, locale) },
                  ]}
                />
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
                    sx={{
                      py: 1.25,
                      '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 540 }} className="tabular">
                          {formatMoney(payment.amount, locale)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(payment.paidAt, locale, 'long')} · {t(`method.${payment.method}`)}
                          {payment.membershipPlanName ? ` · ${payment.membershipPlanName}` : ''}
                        </Typography>
                      </Box>
                      {payment.status !== 'COMPLETED' ? (
                        <StatusChip
                          label={t(`status.${payment.status}`)}
                          tone={
                            PAYMENT_STATUS_TONE[payment.status as keyof typeof PAYMENT_STATUS_TONE] ??
                            'neutral'
                          }
                        />
                      ) : null}
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
