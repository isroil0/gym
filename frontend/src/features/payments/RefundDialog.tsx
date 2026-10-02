'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { FormDialog } from '@/components/forms/FormDialog';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatMoney, CURRENCY } from '@/lib/format/money';
import { useRefundPayment } from './usePayments';
import type { Payment } from '@/lib/api/types';

/**
 * Give money back.
 *
 * The ceiling is `refundableAmount` from the backend, not the gross amount:
 * a payment already partly refunded cannot be refunded in full again. The
 * reason is required because the backend requires it, and because a refund
 * without one is unauditable.
 */
export function RefundDialog({
  open,
  payment,
  onClose,
}: {
  open: boolean;
  payment: Payment;
  onClose: () => void;
}) {
  const t = useTranslations('payments.refund');
  const tp = useTranslations('payments');
  const tv = useTranslations('validation');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refund = useRefundPayment(payment.id);
  const ceiling = Number(payment.refundableAmount);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setMethod('');
    setReason('');
    setError(null);
  }, [open]);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= ceiling && reason.trim().length > 0;
  const tooMuch = amount !== '' && Number.isFinite(value) && value > ceiling;

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={refund.isPending}
      disabled={!valid}
      error={error}
      destructive
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const body: Record<string, unknown> = { amount: value, reason: reason.trim() };
        if (method) body.method = method;
        try {
          await refund.mutateAsync(body);
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <Alert severity="info" variant="outlined">
        {t('maxRefundable', { amount: formatMoney(payment.refundableAmount, locale) })}
      </Alert>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          size="small"
          label={t('amount')}
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
          error={tooMuch}
          helperText={tooMuch ? tv('max', { max: ceiling }) : undefined}
          slotProps={{
            htmlInput: { inputMode: 'decimal', className: 'tabular' },
            input: { endAdornment: <InputAdornment position="end">{CURRENCY}</InputAdornment> },
          }}
          autoFocus
          fullWidth
        />
        <TextField
          select
          size="small"
          label={tp('fields.method')}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          fullWidth
        >
          <MenuItem value="">
            <em>{tp(`method.${payment.method}`)}</em>
          </MenuItem>
          {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((option) => (
            <MenuItem key={option} value={option}>
              {tp(`method.${option}`)}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Button size="small" variant="text" onClick={() => setAmount(payment.refundableAmount)} sx={{ alignSelf: 'flex-start' }}>
        {t('full')}
      </Button>

      <TextField
        size="small"
        label={t('reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        multiline
        rows={2}
        fullWidth
      />
    </FormDialog>
  );
}
