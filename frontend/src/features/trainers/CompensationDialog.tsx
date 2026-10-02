'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import { FormDialog } from '@/components/forms/FormDialog';
import { MoneyInput, NumberInput, SelectInput } from '@/components/forms/fields';
import { validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { useUpdateCompensation } from './useTrainers';
import { COMPENSATION_TYPES, type Trainer } from '@/lib/api/types';

interface Values {
  compensationType: string;
  monthlySalary?: string;
  commissionRate?: string;
}

/**
 * What a trainer is paid.
 *
 * Which fields are required depends on the type the backend was given:
 * a salary for FIXED, a rate for COMMISSION, both for the combination. The
 * form mirrors that so a refusal never comes as a surprise from the server.
 */
export function CompensationDialog({
  open,
  trainer,
  onClose,
}: {
  open: boolean;
  trainer: Trainer;
  onClose: () => void;
}) {
  const t = useTranslations('trainers.compensation');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const v = validators(tv);

  const schema = z
    .object({
      compensationType: z.enum(COMPENSATION_TYPES),
      monthlySalary: z.string().optional(),
      commissionRate: z.string().optional(),
    })
    .superRefine((value, ctx) => {
      const needsSalary = value.compensationType === 'FIXED' || value.compensationType === 'FIXED_PLUS_COMMISSION';
      const needsRate =
        value.compensationType === 'COMMISSION' || value.compensationType === 'FIXED_PLUS_COMMISSION';

      if (needsSalary) {
        const result = v.money({ min: 0 }).safeParse(value.monthlySalary ?? '');
        if (!result.success) {
          ctx.addIssue({ code: 'custom', path: ['monthlySalary'], message: result.error.issues[0]!.message });
        }
      }
      if (needsRate) {
        const rate = Number(value.commissionRate);
        if (!value.commissionRate || !Number.isFinite(rate) || rate < 0 || rate > 100) {
          ctx.addIssue({ code: 'custom', path: ['commissionRate'], message: tv('max', { max: 100 }) });
        }
      }
    });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: { compensationType: 'NONE', monthlySalary: '', commissionRate: '' },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;
  const mutation = useUpdateCompensation(trainer.id);

  useEffect(() => {
    if (!open) return;
    reset({
      compensationType: trainer.compensationType ?? 'NONE',
      monthlySalary: trainer.monthlySalary ?? '',
      commissionRate: trainer.commissionRate ?? '',
    });
    clearFormError();
  }, [open, trainer, reset, clearFormError]);

  const type = form.watch('compensationType');
  const showSalary = type === 'FIXED' || type === 'FIXED_PLUS_COMMISSION';
  const showRate = type === 'COMMISSION' || type === 'FIXED_PLUS_COMMISSION';

  const submit = form.handleSubmit(async (values) => {
    clearFormError();
    const body: Record<string, unknown> = { compensationType: values.compensationType };
    if (showSalary) body.monthlySalary = Number(values.monthlySalary);
    if (showRate) body.commissionRate = Number(values.commissionRate);
    try {
      await mutation.mutateAsync(body);
      toast.success(t('updated'));
      onClose();
    } catch (error) {
      handleError(error);
    }
  });

  return (
    <FormDialog
      open={open}
      title={t('edit')}
      submitLabel={ta('save')}
      onClose={onClose}
      onSubmit={submit}
      submitting={mutation.isPending}
      error={formError}
      maxWidth="xs"
    >
      <SelectInput
        control={form.control}
        name="compensationType"
        label={t('type')}
        options={COMPENSATION_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
      />
      <Box sx={{ display: 'grid', gap: 2 }}>
        {showSalary ? (
          <MoneyInput control={form.control} name="monthlySalary" label={t('baseSalary')} required />
        ) : null}
        {showRate ? (
          <NumberInput
            control={form.control}
            name="commissionRate"
            label={t('commissionPercent')}
            min={0}
            max={100}
            step={0.5}
            suffix="%"
            required
          />
        ) : null}
      </Box>
    </FormDialog>
  );
}
