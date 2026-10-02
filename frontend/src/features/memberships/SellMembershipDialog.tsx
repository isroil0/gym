'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CheckIcon from '@mui/icons-material/CheckCircleRounded';
import { alpha } from '@mui/material/styles';
import { FormDialog } from '@/components/forms/FormDialog';
import { MemberPicker } from './MemberPicker';
import { MembershipStatusChip } from './MembershipStatusChip';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatMoney } from '@/lib/format/money';
import { formatDate, toIsoDate } from '@/lib/format/datetime';
import { useMembershipList, usePlans, useSellMembership } from './useMemberships';
import type { Member, Membership, MembershipPlan } from '@/lib/api/types';

type Step = 0 | 1 | 2;

/**
 * Sell a membership: choose the member, choose the plan, check it, confirm.
 *
 * The review step exists because this is the moment money is committed. It
 * shows the price and dates that will be written down, and warns if the
 * member already holds something covering those days — the backend refuses
 * overlaps, and finding that out before pressing the button is kinder than
 * after.
 */
export function SellMembershipDialog({
  open,
  onClose,
  member: fixedMember,
  onSold,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-selected when selling from a member's own page. */
  member?: Member;
  onSold?: (membership: Membership) => void;
}) {
  const t = useTranslations('memberships.sell');
  const tm = useTranslations('memberships');
  const tf = useTranslations('memberships.fields');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();

  const [step, setStep] = useState<Step>(fixedMember ? 1 : 0);
  const [member, setMember] = useState<Member | null>(fixedMember ?? null);
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const plans = usePlans({ status: 'ACTIVE' });
  const sell = useSellMembership(member?.id);

  // What the member already holds, so an overlap can be flagged up front.
  const existing = useMembershipList({
    memberId: member?.id ?? '',
    limit: '20',
    page: '1',
    planId: '',
    status: '',
    endingBefore: '',
    endingAfter: '',
  });

  useEffect(() => {
    if (!open) return;
    setStep(fixedMember ? 1 : 0);
    setMember(fixedMember ?? null);
    setPlan(null);
    setStartDate('');
    setNotes('');
    setError(null);
  }, [open, fixedMember]);

  const live = useMemo(
    () =>
      (existing.data?.data ?? []).filter((m) =>
        ['PENDING', 'ACTIVE', 'FROZEN'].includes(m.status as string),
      ),
    [existing.data],
  );

  const effectiveStart = startDate || toIsoDate(new Date());
  const projectedEnd = plan ? addDays(effectiveStart, plan.durationDays - 1) : null;

  const overlaps = live.some(
    (m) =>
      projectedEnd !== null &&
      m.startDate.slice(0, 10) <= projectedEnd &&
      effectiveStart <= m.endDate.slice(0, 10),
  );

  const canAdvance = step === 0 ? Boolean(member) : step === 1 ? Boolean(plan) : true;

  const confirm = async () => {
    if (!member || !plan) return;
    setError(null);
    const body: Record<string, unknown> = { memberId: member.id, planId: plan.id };
    if (startDate) body.startDate = startDate;
    if (notes.trim()) body.notes = notes.trim();
    try {
      const sold = await sell.mutateAsync(body);
      toast.success(t('success'));
      onSold?.(sold);
      onClose();
    } catch (cause) {
      setError(describe(cause));
    }
  };

  return (
    <FormDialog
      open={open}
      title={t('title')}
      submitLabel={step === 2 ? t('confirmButton') : tc('actions.next')}
      onClose={onClose}
      submitting={sell.isPending}
      disabled={!canAdvance}
      error={error}
      maxWidth="sm"
      extraActions={
        step > (fixedMember ? 1 : 0) ? (
          <Button onClick={() => setStep((s) => (s - 1) as Step)} disabled={sell.isPending} color="inherit">
            {tc('actions.back')}
          </Button>
        ) : null
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (step < 2) setStep((s) => (s + 1) as Step);
        else void confirm();
      }}
    >
      <Stepper activeStep={step} sx={{ mb: 1 }}>
        <Step>
          <StepLabel>{t('steps.member')}</StepLabel>
        </Step>
        <Step>
          <StepLabel>{t('steps.plan')}</StepLabel>
        </Step>
        <Step>
          <StepLabel>{t('steps.review')}</StepLabel>
        </Step>
      </Stepper>

      {step === 0 ? (
        <>
          <Typography variant="body2" color="text.secondary">
            {t('selectMember')}
          </Typography>
          <MemberPicker value={member} onChange={setMember} label={tf('member')} required autoFocus />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Typography variant="body2" color="text.secondary">
            {t('selectPlan')}
          </Typography>
          <Stack spacing={1}>
            {(plans.data?.data ?? []).map((option) => {
              const selected = plan?.id === option.id;
              return (
                <Card
                  key={option.id}
                  variant="outlined"
                  sx={{
                    borderColor: (theme) => (selected ? theme.palette.primary.main : theme.palette.divider),
                    bgcolor: (theme) =>
                      selected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                  }}
                >
                  <CardActionArea onClick={() => setPlan(option)}>
                    <CardContent sx={{ py: 1.5, px: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 560 }} noWrap>
                            {option.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tm('plans.durationDays', { count: option.durationDays })} ·{' '}
                            {option.unlimitedVisits
                              ? tm('visits.unlimited')
                              : tm('visits.remaining', { count: option.visitLimit ?? 0 })}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" className="tabular" sx={{ fontWeight: 580 }}>
                            {formatMoney(option.price, locale)}
                          </Typography>
                          {selected ? <CheckIcon color="primary" sx={{ fontSize: 18 }} /> : null}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
            {(plans.data?.data.length ?? 0) === 0 && !plans.isPending ? (
              <Alert severity="info" variant="outlined">
                {tm('plans.empty.body')}
              </Alert>
            ) : null}
          </Stack>

          <TextField
            type="date"
            size="small"
            label={tf('startDate')}
            helperText={tf('startDateHint')}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </>
      ) : null}

      {step === 2 && member && plan ? (
        <>
          <Typography variant="h5">{t('reviewTitle')}</Typography>
          {live.length > 0 ? (
            <Alert severity={overlaps ? 'warning' : 'info'} variant="outlined">
              {overlaps
                ? t('overlapWarning')
                : t('existingActive', { date: formatDate(live[0]!.endDate, locale) })}
              <Box sx={{ mt: 1 }}>
                {live.map((m) => (
                  <Stack key={m.id} direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <MembershipStatusChip membership={m} />
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(m.startDate, locale)} – {formatDate(m.endDate, locale)}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Alert>
          ) : null}

          <DefinitionList
            columns={2}
            items={[
              {
                label: tf('member'),
                value: `${member.account.firstName} ${member.account.lastName} · ${member.memberCode}`,
                wide: true,
              },
              { label: tf('plan'), value: plan.name },
              { label: tf('purchasePrice'), value: formatMoney(plan.price, locale) },
              { label: tf('startDate'), value: formatDate(effectiveStart, locale, 'long') },
              {
                label: tm('columns.endDate'),
                value: projectedEnd ? formatDate(projectedEnd, locale, 'long') : '—',
              },
              {
                label: tm('columns.visits'),
                value: plan.unlimitedVisits
                  ? tm('visits.unlimited')
                  : tm('visits.remaining', { count: plan.visitLimit ?? 0 }),
              },
            ]}
          />

          <Divider />
          <Typography variant="caption" color="text.secondary">
            {t('reviewHint')}
          </Typography>

          <TextField
            size="small"
            label={tf('notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            rows={2}
          />
        </>
      ) : null}
    </FormDialog>
  );
}

/** The inclusive end date: a 30-day plan starting on the 1st ends on the 30th. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
