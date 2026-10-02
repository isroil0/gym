'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import { FormDialog } from '@/components/forms/FormDialog';
import { DateInput, MoneyInput, SelectInput, TextInput } from '@/components/forms/fields';
import { validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { toIsoDate } from '@/lib/format/datetime';
import { useCreateCategory, useCreateEntry, useExpenseCategories } from './useAccounting';
import { CategoryPicker } from './CategoryPicker';
import { PAYMENT_METHODS } from '@/lib/api/types';

interface Values {
  amount: string;
  categoryName: string;
  description: string;
  occurredOn: string;
  method: string;
  trainerId?: string;
}

/** The longest name the backend will accept for a category. */
const CATEGORY_NAME_MAX = 120;

/**
 * Record money going out.
 *
 * The category can be picked from the list or simply typed: a name that is
 * not there yet is created when the expense is saved, so recording a cost
 * never means breaking off to go and set a category up first. Nothing is
 * created until save, so abandoning the dialog leaves nothing behind.
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
  const createCategory = useCreateCategory();

  const schema = z.object({
    amount: v.money({ min: 0.01 }),
    categoryName: v.requiredText(CATEGORY_NAME_MAX),
    description: v.requiredText(255),
    occurredOn: v.isoDate(true),
    method: z.string().optional(),
    trainerId: z.string().optional(),
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      amount: '',
      categoryName: '',
      description: '',
      occurredOn: toIsoDate(new Date()),
      method: 'TRANSFER',
      trainerId: trainerId ?? '',
    },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      amount: '',
      categoryName: '',
      description: trainerName ? `${trainerName}` : '',
      occurredOn: toIsoDate(new Date()),
      method: 'TRANSFER',
      trainerId: trainerId ?? '',
    });
    clearFormError();
  }, [open, reset, clearFormError, trainerId, trainerName]);

  /**
   * Turns the typed name into the id the backend wants.
   *
   * An existing category is matched without regard to case, so typing "rent"
   * when "Rent" is already there reuses it instead of creating a second one
   * the reports would have to show side by side. Anything genuinely new is
   * created now, at save, not while the reader was still typing.
   */
  const resolveCategory = async (typed: string): Promise<string> => {
    const name = typed.trim();
    const existing = (categories.data?.data ?? []).find(
      (category) => category.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.id;

    const created = await createCategory.mutateAsync({ name });
    return created.id;
  };

  const submit = form.handleSubmit(async (values) => {
    clearFormError();

    let categoryId: string;
    try {
      categoryId = await resolveCategory(values.categoryName);
    } catch (error) {
      handleError(error);
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
      submitting={create.isPending || createCategory.isPending}
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

      <Controller
        control={form.control}
        name="categoryName"
        render={({ field, fieldState }) => (
          <CategoryPicker
            categories={categories.data?.data ?? []}
            value={field.value}
            onChange={field.onChange}
            label={tf('category')}
            addLabel={(name) => t('addCategory', { name })}
            error={fieldState.error?.message}
            disabled={categories.isPending}
          />
        )}
      />

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
