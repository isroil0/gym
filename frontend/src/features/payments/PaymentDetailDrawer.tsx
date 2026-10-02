'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/CloseRounded';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { StatusChip, PAYMENT_STATUS_TONE } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { RefundDialog } from './RefundDialog';
import { usePayment } from './usePayments';
import type { Payment } from '@/lib/api/types';

/**
 * One payment in full, including its refunds.
 *
 * A drawer rather than a page: looking at a receipt should not lose the
 * reader's place in the list, their filters or their scroll position.
 */
export function PaymentDetailDrawer({
  payment,
  onClose,
}: {
  payment: Payment | null;
  onClose: () => void;
}) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const [refunding, setRefunding] = useState(false);

  // Re-read while open: a refund taken in this drawer changes the figures.
  const { data } = usePayment(payment?.id ?? '');
  const current = data ?? payment;

  return (
    <>
      <Drawer
        anchor="right"
        open={Boolean(payment)}
        onClose={onClose}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, p: 0 } } }}
      >
        {current ? (
          <Box sx={{ p: 3 }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2.5 }}>
              <Box>
                <Typography variant="h3">{formatMoney(current.amount, locale)}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                  <StatusChip
                    label={t(`status.${current.status}`)}
                    tone={
                      PAYMENT_STATUS_TONE[current.status as keyof typeof PAYMENT_STATUS_TONE] ??
                      'neutral'
                    }
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t(`method.${current.method}`)}
                  </Typography>
                </Stack>
              </Box>
              <IconButton size="small" onClick={onClose} aria-label={tc('actions.close')}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Divider sx={{ mb: 2.5 }} />

            <DefinitionList
              columns={2}
              items={[
                { label: t('detail.receivedFrom'), value: `${current.memberName ?? '—'}` },
                { label: tc('labels.date'), value: formatDateTime(current.paidAt, locale) },
                { label: t('detail.appliedTo'), value: current.membershipPlanName ?? '—' },
                { label: t('columns.reference'), value: current.reference ?? '—' },
                { label: t('refund.refundedAmount'), value: formatMoney(current.refundedAmount, locale) },
                { label: t('columns.net'), value: formatMoney(current.netAmount, locale) },
                { label: t('detail.recordedBy'), value: current.recordedBy ?? '—', wide: true },
                ...(current.notes ? [{ label: tc('labels.notes'), value: current.notes, wide: true }] : []),
              ]}
            />

            {current.refunds && current.refunds.length > 0 ? (
              <>
                <Divider sx={{ my: 2.5 }} />
                <Typography variant="h5" sx={{ mb: 1.5 }}>
                  {t('refund.history')}
                </Typography>
                <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {current.refunds.map((entry) => (
                    <Box
                      component="li"
                      key={entry.id}
                      sx={{
                        py: 1,
                        '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {entry.reason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(entry.refundedAt, locale)}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          className="tabular"
                          sx={{ color: 'error.main', flexShrink: 0 }}
                        >
                          −{formatMoney(entry.amount, locale)}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </>
            ) : null}

            {Number(current.refundableAmount) > 0 ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<UndoIcon sx={{ fontSize: 16 }} />}
                onClick={() => setRefunding(true)}
                sx={{ mt: 3 }}
                fullWidth
              >
                {t('refund.title')}
              </Button>
            ) : null}
          </Box>
        ) : null}
      </Drawer>

      {current ? (
        <RefundDialog open={refunding} payment={current} onClose={() => setRefunding(false)} />
      ) : null}
    </>
  );
}
