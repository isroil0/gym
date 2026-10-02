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
import { useCreateEntry, useExpenseCategories } from './useAccounting';
import { PAYMENT_METHODS } from '@/lib/api/types';

interface Values {
  amount: string;
  description: string;
  occurredOn: string;
  method: string;
  trainerId?: string;
}

/** The category uncategorised expenses are filed under. */
const DEFAULT_CATEGORY_NAME = 'other';

/**
 * Picks the category an expense is filed under when nobody is asked to choose.
 *
 * "Other" exists for exactly this purpose, so prefer it by name; any active
 * category is better than failing to record the expense, so fall back to the
 * first. Returns undefined only when the gym has no active category at all,
 * which the caller has to surface rather than post a request the backend is
 * certain to reject.
 */
function defaultCategoryId(categories: { id: string; name: string }[]): string | undefined {
  const named = categories.find(
    (category) => category.name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME,
  );
  return (named ?? categories[0])?.id;
}

/**
 * Record money going out.
 *
 * The expense is filed under a category automatically rather than asking for
 * one: the backend rejects an uncategorised expense, so the field cannot
 * simply be dropped from the request. Categories remain editable under
 * Accounting, and reports still group by them — every expense recorded here
 * just lands in the same bucket.
 *
 * The optional trainer attributes the expense to a person, which is how a
 * salary or commission payment is recorded.
 */
export function ExpenseDialog({
  open,
  onClose,
  trainerId,
  trainerName,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-attributes the expense, when recording a trainer's pay. */
  trainerId?: string;
  trainerName?: string;
}) {
  const t = useTranslations('accounting.expense');
  const tf = useTranslations('accounting.expense.fields');
  const tp = useTranslations('payments');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const v = validators(tv);

  const categories = useExpenseCategories();
  const create = useCreateEntry();

  const schema = z.object({
    amount: v.money({ min: 0.01 }),
    description: v.requiredText(255),
    occurredOn: v.isoDate(true),
    method: z.string().optional(),
    trainerId: z.string().optional(),
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      amount: '',
      description: '',
      occurredOn: toIsoDate(new Date()),
      method: 'TRANSFER',
      trainerId: trainerId ?? '',
    },
  });
  const { formError, setFormError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      amount: '',
      description: trainerName ? `${trainerName}` : '',
      occurredOn: toIsoDate(new Date()),
      method: 'TRANSFER',
      trainerId: trainerId ?? '',
    });
    clearFormError();
  }, [open, reset, clearFormError, trainerId, trainerName]);

  const submit = form.handleSubmit(async (values) => {
    clearFormError();

    const categoryId = defaultCategoryId(categories.data?.data ?? []);
    if (!categoryId) {
      // Nothing to file this under; say so rather than send a request the
      // backend will refuse.
      setFormError(t('noCategory'));
      return;
    }

    const body: Record<string, unknown> = {
      type: 'EXPENSE',
      amount: Number(values.amount),
      occurredOn: values.occurredOn,
      description: values.description,
      expenseCategoryId: categoryId,
    };
    if (values.method) body.method = values.method;
    if (values.trainerId) body.trainerId = values.trainerId;

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
      submitting={create.isPending || categories.isPending}
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
        label={tf('method')}
        options={PAYMENT_METHODS.map((value) => ({ value, label: tp(`method.${value}`) }))}
      />
    </FormDialog>
  );
}
