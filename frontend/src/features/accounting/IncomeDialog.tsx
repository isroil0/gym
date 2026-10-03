'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import { FormDialog } from '@/components/forms/FormDialog';
import { DateInput, MoneyInput, SelectInput, TextInput } from '@/components/forms/fields';
import { validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { toIsoDate } from '@/lib/format/datetime';
import { useCreateEntry } from './useAccounting';
import { PAYMENT_METHODS } from '@/lib/api/types';

interface Values {
  amount: string;
  description: string;
  occurredOn: string;
  method: string;
}

/**
 * Record money coming in that no membership payment produced — a drinks
 * fridge, a locker rental, a one-off hire of the hall.
 *
 * Deliberately not a mirror of the expense dialog. The backend refuses an
 * income entry carrying an expense category or a trainer, because neither
 * means anything for money arriving, and it files every manual entry under
 * the "other" income source itself. Membership payments reach the books on
 * their own and must never be entered here, or the month would count them
 * twice.
 */
export function IncomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('accounting.income');
  const tf = useTranslations('accounting.expense.fields');
  const tp = useTranslations('payments');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const v = validators(tv);

  const create = useCreateEntry();

  const schema = z.object({
    amount: v.money({ min: 0.01 }),
    description: v.requiredText(255),
    occurredOn: v.isoDate(true),
    method: z.string().optional(),
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      amount: '',
      description: '',
      occurredOn: toIsoDate(new Date()),
      method: 'CASH',
    },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      amount: '',
      description: '',
      occurredOn: toIsoDate(new Date()),
      method: 'CASH',
    });
    clearFormError();
  }, [open, reset, clearFormError]);

  const submit = form.handleSubmit(async (values) => {
    clearFormError();
    const body: Record<string, unknown> = {
      type: 'INCOME',
      amount: Number(values.amount),
      occurredOn: values.occurredOn,
      description: values.description,
    };
    if (values.method) body.method = values.method;

    try {
      await create.mutateAsync(body);
      toast.success(t('success'));
      onClose();
    } catch (error) {
      handleError(error);
    }
  });

  return (
    <FormDialog
      open={open}
      title={t('addTitle')}
      submitLabel={ta('save')}
      onClose={onClose}
      onSubmit={submit}
      submitting={create.isPending}
      error={formError}
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <MoneyInput control={form.control} name="amount" label={tf('amount')} required autoFocus />
        <DateInput
          control={form.control}
          name="occurredOn"
          label={tf('occurredOn')}
          required
          max={toIsoDate(new Date())}
        />
      </Box>

      <TextInput control={form.control} name="description" label={tf('description')} required />

      <SelectInput
        control={form.control}
        name="method"
        label={t('receivedBy')}
        options={PAYMENT_METHODS.map((value) => ({ value, label: tp(`method.${value}`) }))}
      />
    </FormDialog>
  );
}
