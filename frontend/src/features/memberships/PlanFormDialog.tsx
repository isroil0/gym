'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import { FormDialog } from '@/components/forms/FormDialog';
import { MoneyInput, NumberInput, SwitchInput, TextInput } from '@/components/forms/fields';
import { validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { useCreatePlan, useUpdatePlan } from './useMemberships';
import type { MembershipPlan } from '@/lib/api/types';

interface Values {
  name: string;
  description?: string;
  durationDays: string;
  price: string;
  unlimitedVisits: boolean;
  visitLimit?: string;
  displayOrder?: string;
}

/**
 * Create or edit a plan.
 *
 * Changing a price here affects only future sales — the backend copies the
 * price onto each membership at the moment it is sold, so memberships
 * already bought keep what was agreed. The helper text says so, because it
 * is the question every manager asks before touching this form.
 */
export function PlanFormDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan?: MembershipPlan;
}) {
  const t = useTranslations('memberships.plans');
  const tf = useTranslations('memberships.plans.fields');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const editing = Boolean(plan);
  const v = validators(tv);

  const schema = z
    .object({
      name: v.requiredText(120),
      description: v.optionalText(500),
      durationDays: z.string().min(1, tv('required')),
      price: v.money({ min: 0 }),
      unlimitedVisits: z.boolean(),
      visitLimit: z.string().optional(),
      displayOrder: z.string().optional(),
    })
    .superRefine((value, ctx) => {
      const days = Number(value.durationDays);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        ctx.addIssue({ code: 'custom', path: ['durationDays'], message: tv('min', { min: 1 }) });
      }
      // A limited plan must say how many visits it includes.
      if (!value.unlimitedVisits) {
        const visits = Number(value.visitLimit);
        if (!value.visitLimit || !Number.isInteger(visits) || visits < 1) {
          ctx.addIssue({ code: 'custom', path: ['visitLimit'], message: tv('min', { min: 1 }) });
        }
      }
    });

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      name: '',
      description: '',
      durationDays: '30',
      price: '',
      unlimitedVisits: true,
      visitLimit: '',
      displayOrder: '0',
    },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  const create = useCreatePlan();
  const update = useUpdatePlan(plan?.id ?? '');
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    reset({
      name: plan?.name ?? '',
      description: plan?.description ?? '',
      durationDays: String(plan?.durationDays ?? 30),
      price: plan?.price ?? '',
      unlimitedVisits: plan ? plan.unlimitedVisits : true,
      visitLimit: plan?.visitLimit != null ? String(plan.visitLimit) : '',
      displayOrder: String(plan?.displayOrder ?? 0),
    });
    clearFormError();
  }, [open, plan, reset, clearFormError]);

  const unlimited = form.watch('unlimitedVisits');

  const submit = form.handleSubmit(async (values) => {
    clearFormError();
    const body: Record<string, unknown> = {
      name: values.name,
      durationDays: Number(values.durationDays),
      price: Number(values.price),
      // null is how the backend spells "unlimited".
      visitLimit: values.unlimitedVisits ? null : Number(values.visitLimit),
      displayOrder: Number(values.displayOrder ?? 0),
    };
    if (values.description) body.description = values.description;

    try {
      await mutation.mutateAsync(body);
      toast.success(editing ? t('updated') : t('created'));
      onClose();
    } catch (error) {
      handleError(error);
    }
  });

  return (
    <FormDialog
      open={open}
      title={editing ? t('edit') : t('createTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('create')}
      onClose={onClose}
      onSubmit={submit}
      submitting={mutation.isPending}
      error={formError}
    >
      <TextInput control={form.control} name="name" label={tf('name')} required autoFocus />
      <TextInput control={form.control} name="description" label={tf('description')} multiline rows={2} />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <NumberInput
          control={form.control}
          name="durationDays"
          label={tf('durationDays')}
          min={1}
          max={3650}
          required
        />
        <MoneyInput
          control={form.control}
          name="price"
          label={tf('price')}
          required
          helperText={editing ? t('priceChangeHint') : undefined}
        />
      </Box>

      <SwitchInput
        control={form.control}
        name="unlimitedVisits"
        label={tf('unlimitedVisits')}
        helperText={tf('unlimitedHint')}
      />
      {!unlimited ? (
        <NumberInput control={form.control} name="visitLimit" label={tf('visitLimit')} min={1} required />
      ) : null}

      <NumberInput control={form.control} name="displayOrder" label={tf('displayOrder')} min={0} />
    </FormDialog>
  );
}
