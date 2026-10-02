'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import { FormDialog } from '@/components/forms/FormDialog';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatDate } from '@/lib/format/datetime';
import { formatMoney, CURRENCY } from '@/lib/format/money';
import {
  useApplyDiscount,
  useCancelMembership,
  useExtendMembership,
  useFreezeMembership,
  usePlans,
  useRenewMembership,
  useUnfreezeMembership,
} from './useMemberships';
import type { Membership } from '@/lib/api/types';

interface ActionProps {
  open: boolean;
  membership: Membership;
  onClose: () => void;
}

/** Freeze: the clock stops and the member cannot enter. */
export function FreezeDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.freeze');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const freeze = useFreezeMembership(membership.id, membership.member?.id);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={freeze.isPending}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await freeze.mutateAsync(reason.trim() ? { reason: reason.trim() } : {});
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('reason')}
        placeholder={t('reasonPlaceholder')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
        fullWidth
      />
    </FormDialog>
  );
}

/** Unfreeze: the frozen days are credited back to the end date. */
export function UnfreezeDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.unfreeze');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const unfreeze = useUnfreezeMembership(membership.id, membership.member?.id);

  // Days already banked, plus the stretch currently running.
  const frozenSoFar =
    membership.totalFrozenDays +
    (membership.frozenAt
      ? Math.max(
          0,
          Math.floor((Date.now() - Date.parse(membership.frozenAt)) / 86_400_000),
        )
      : 0);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={unfreeze.isPending}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await unfreeze.mutateAsync({} as never);
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <Alert severity="info" variant="outlined">
        {t('daysCredited', { count: frozenSoFar })}
      </Alert>
    </FormDialog>
  );
}

/** Extend: add days to the end date, for a goodwill gesture or a closure. */
export function ExtendDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.extend');
  const tv = useTranslations('validation');
  const { locale } = useLocale();
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const extend = useExtendMembership(membership.id, membership.member?.id);

  useEffect(() => {
    if (open) {
      setDays('7');
      setReason('');
      setError(null);
    }
  }, [open]);

  const count = Number(days);
  const valid = Number.isInteger(count) && count >= 1 && count <= 365;
  const newEnd = valid ? shift(membership.endDate.slice(0, 10), count) : null;

  return (
    <FormDialog
      open={open}
      title={t('title')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={extend.isPending}
      disabled={!valid}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await extend.mutateAsync({ days: count, ...(reason.trim() ? { reason: reason.trim() } : {}) });
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        type="number"
        label={t('days')}
        value={days}
        onChange={(event) => setDays(event.target.value)}
        error={days !== '' && !valid}
        helperText={days !== '' && !valid ? tv('max', { max: 365 }) : undefined}
        slotProps={{ htmlInput: { min: 1, max: 365, className: 'tabular' } }}
        autoFocus
        fullWidth
      />
      <TextField
        size="small"
        label={t('reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        fullWidth
      />
      {newEnd ? (
        <Alert severity="info" variant="outlined">
          {t('newEndDate', { date: formatDate(newEnd, locale, 'long') })}
        </Alert>
      ) : null}
    </FormDialog>
  );
}

/** Cancel: ends the membership now. Not reversible. */
export function CancelDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.cancel');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const cancel = useCancelMembership(membership.id, membership.member?.id);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={cancel.isPending}
      error={error}
      destructive
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await cancel.mutateAsync(reason.trim() ? { reason: reason.trim() } : {});
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
        fullWidth
        multiline
        rows={2}
      />
    </FormDialog>
  );
}

/** Discount: reduces what the member owes on this membership. */
export function DiscountDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.discount');
  const tv = useTranslations('validation');
  const { locale } = useLocale();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const discount = useApplyDiscount(membership.id, membership.member?.id);

  useEffect(() => {
    if (open) {
      setAmount(membership.discountAmount && membership.discountAmount !== '0.00' ? membership.discountAmount : '');
      setReason(membership.discountReason ?? '');
      setError(null);
    }
  }, [open, membership]);

  const value = Number(amount || 0);
  const price = Number(membership.purchasePrice);
  const valid = Number.isFinite(value) && value >= 0 && value <= price;
  const newDue = valid ? (price - value).toFixed(2) : null;

  return (
    <FormDialog
      open={open}
      title={t('title')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={discount.isPending}
      disabled={!valid}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await discount.mutateAsync({
            amount: value,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          });
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('amount')}
        value={amount}
        onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
        error={amount !== '' && !valid}
        helperText={amount !== '' && !valid ? tv('max', { max: price }) : undefined}
        slotProps={{
          htmlInput: { inputMode: 'decimal', className: 'tabular' },
          input: { endAdornment: <InputAdornment position="end">{CURRENCY}</InputAdornment> },
        }}
        autoFocus
        fullWidth
      />
      <TextField
        size="small"
        label={t('reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        fullWidth
      />
      {newDue !== null ? (
        <Alert severity="info" variant="outlined">
          {t('newTotal', { amount: formatMoney(newDue, locale) })}
        </Alert>
      ) : null}
    </FormDialog>
  );
}

/** Renew: a fresh term, starting the day after this one ends. */
export function RenewDialog({ open, membership, onClose }: ActionProps) {
  const t = useTranslations('memberships.renew');
  const tf = useTranslations('memberships.fields');
  const { locale } = useLocale();
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const plans = usePlans({ status: 'ACTIVE' });
  const renew = useRenewMembership(membership.id, membership.member?.id);

  useEffect(() => {
    if (open) {
      setPlanId(membership.plan.id);
      setError(null);
    }
  }, [open, membership.plan.id]);

  const startsOn = shift(membership.endDate.slice(0, 10), 1);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={renew.isPending}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          // Only send planId when it differs; the backend defaults to the
          // plan being renewed.
          await renew.mutateAsync(planId && planId !== membership.plan.id ? { planId } : {});
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        select
        size="small"
        label={tf('plan')}
        value={planId}
        onChange={(event) => setPlanId(event.target.value)}
        fullWidth
      >
        {(plans.data?.data ?? []).map((plan) => (
          <MenuItem key={plan.id} value={plan.id}>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <span>{plan.name}</span>
              <Typography component="span" variant="caption" color="text.secondary">
                {formatMoney(plan.price, locale)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </TextField>

      <Alert severity="info" variant="outlined">
        {t('startsOn', { date: formatDate(startsOn, locale, 'long') })}
      </Alert>
    </FormDialog>
  );
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
