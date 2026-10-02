'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import { formatRelative } from '@/lib/format/datetime';
import { StatusChip } from '@/components/ui/StatusChip';
import type { Paginated, Payment } from '@/lib/api/types';

const QUERY = { page: 1, limit: 6 };

/** The last handful of payments taken. */
export function RecentPayments() {
  const t = useTranslations('payments');
  const { locale } = useLocale();

  const { data, isPending } = useQuery({
    queryKey: keys.payments.list(QUERY),
    queryFn: () => api.get<Paginated<Payment>>('payments', { query: QUERY }),
  });

  if (isPending) return <ListSkeleton rows={4} />;
  if (!data || data.data.length === 0) {
    return <EmptyState title={t('empty.title')} body={t('empty.body')} compact />;
  }

  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {data.data.map((payment) => (
        <Box
          component="li"
          key={payment.id}
          sx={{ '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}
        >
          <Stack
            component={Link}
            href={`/admin/payments/${payment.id}`}
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
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {payment.memberName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {t(`method.${payment.method}`)} · {formatRelative(payment.paidAt, locale)}
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
              <Typography variant="body2" className="tabular" sx={{ fontWeight: 580 }}>
                {formatMoney(payment.amount, locale)}
              </Typography>
              {payment.status !== 'COMPLETED' ? (
                <StatusChip label={t(`status.${payment.status}`)} tone="warning" />
              ) : null}
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
