'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FormDialog } from '@/components/forms/FormDialog';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { StatusChip, BILLING_STATUS_TONE } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatMoney, CURRENCY } from '@/lib/format/money';
import { formatDate } from '@/lib/format/datetime';
import { useMemberBilling, useTakePayment } from './usePayments';
import type { Member } from '@/lib/api/types';

/**
 * Record money received.
 *
 * The outstanding balance is fetched for whichever member is chosen, so the
 * person at the desk can see what is owed and against which membership
 * before entering an amount. "Pay in full" fills the exact figure rather
 * than making somebody retype it and risk a typo in a financial record.
 */
export function TakePaymentDialog({
  open,
  onClose,
  member: fixedMember,
}: {
  open: boolean;
  onClose: () => void;
  member?: Member;
}) {
  const t = useTranslations('payments');
  const tt = useTranslations('payments.take');
  const tf = useTranslations('payments.fields');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();

  const [member, setMember] = useState<Member | null>(fixedMember ?? null);
  const [membershipId, setMembershipId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const billing = useMemberBilling(member?.id ?? '');
  const take = useTakePayment();

  useEffect(() => {
    if (!open) return;
    setMember(fixedMember ?? null);
    setMembershipId('');
    setAmount('');
    setMethod('CASH');
    setReference('');
    setError(null);
  }, [open, fixedMember]);

  // Only memberships that still owe something are worth paying against.
  const owing = useMemo(
    () => (billing.data?.memberships ?? []).filter((m) => Number(m.outstanding) > 0),
    [billing.data],
  );

  useEffect(() => {
    if (owing.length === 1 && !membershipId) setMembershipId(owing[0]!.membershipId);
  }, [owing, membershipId]);

  const selected = owing.find((m) => m.membershipId === membershipId);
  const outstanding = selected?.outstanding ?? billing.data?.outstanding ?? '0.00';
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const exceeds = valid && Number(outstanding) > 0 && value > Number(outstanding);

  return (
    <FormDialog
      open={open}
      title={member ? tt('title', { name: `${member.account.firstName} ${member.account.lastName}` }) : t('createTitle')}
      submitLabel={tt('confirm')}
      onClose={onClose}
      submitting={take.isPending}
      disabled={!member || !valid}
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!member) return;
        setError(null);
        const body: Record<string, unknown> = {
          memberId: member.id,
          amount: value,
          method,
        };
        if (membershipId) body.membershipId = membershipId;
        if (reference.trim()) body.reference = reference.trim();
        try {
          await take.mutateAsync(body);
          toast.success(tt('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      {!fixedMember ? (
        <MemberPicker value={member} onChange={setMember} label={tf('member')} required autoFocus />
      ) : null}

      {member && billing.data ? (
        <Alert
          severity={Number(billing.data.outstanding) > 0 ? 'warning' : 'success'}
          variant="outlined"
        >
          {Number(billing.data.outstanding) > 0
            ? tt('outstanding', { amount: formatMoney(billing.data.outstanding, locale) })
            : tt('nothingDue')}
        </Alert>
      ) : null}

      {owing.length > 0 ? (
        <TextField
          select
          size="small"
          label={tf('membership')}
          value={membershipId}
          onChange={(event) => setMembershipId(event.target.value)}
          helperText={!membershipId ? tt('noMembershipSelected') : undefined}
          fullWidth
        >
          {owing.map((balance) => (
            <MenuItem key={balance.membershipId} value={balance.membershipId}>
              <Stack sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{balance.planName}</span>
                  <StatusChip
                    label={t(`billingStatus.${balance.settlementStatus}`)}
                    tone={
                      BILLING_STATUS_TONE[
                        balance.settlementStatus as keyof typeof BILLING_STATUS_TONE
                      ] ?? 'neutral'
                    }
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(balance.startDate, locale)} – {formatDate(balance.endDate, locale)} ·{' '}
                  {formatMoney(balance.outstanding, locale)}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          size="small"
          label={tf('amount')}
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
          error={exceeds}
          helperText={exceeds ? tt('exceedsOutstanding') : undefined}
          slotProps={{
            htmlInput: { inputMode: 'decimal', className: 'tabular' },
            input: { endAdornment: <InputAdornment position="end">{CURRENCY}</InputAdornment> },
          }}
          fullWidth
        />
        <TextField
          select
          size="small"
          label={tf('method')}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          fullWidth
        >
          {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((option) => (
            <MenuItem key={option} value={option}>
              {t(`method.${option}`)}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {Number(outstanding) > 0 ? (
        <Button
          size="small"
          onClick={() => setAmount(outstanding)}
          sx={{ alignSelf: 'flex-start' }}
          variant="text"
        >
          {tt('payInFull')} · {formatMoney(outstanding, locale)}
        </Button>
      ) : null}

      <TextField
        size="small"
        label={tf('reference')}
        helperText={tf('referenceHint')}
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        fullWidth
      />
      <Typography variant="caption" color="text.secondary">
        {tc('labels.date')}: {formatDate(new Date(), locale, 'long')}
      </Typography>
    </FormDialog>
  );
}
