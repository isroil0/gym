'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { FormDialog } from '@/components/forms/FormDialog';
import { TextInput, DateInput } from '@/components/forms/fields';
import { PasswordField } from '@/components/forms/PasswordField';
import { requiredWhen, validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { useCreateTrainer, useUpdateTrainer } from './useTrainers';
import { toIsoDate } from '@/lib/format/datetime';
import type { Trainer } from '@/lib/api/types';

export interface TrainerFormValues {
  firstName: string;
  lastName: string;
  phone?: string;
  specialization?: string;
  bio?: string;
  certifications?: string;
  hiredAt?: string;
  email?: string;
  password?: string;
}

/** Create or edit a trainer. Creating also provisions their sign-in account. */
export function TrainerFormDialog({
  open,
  onClose,
  onCreated,
  trainer,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (trainer: Trainer) => void;
  trainer?: Trainer;
}) {
  const t = useTranslations('trainers');
  const tf = useTranslations('trainers.fields');
  const tc = useTranslations('common');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const editing = Boolean(trainer);

  const v = validators(tv);
  const schema = requiredWhen(
    {
      firstName: v.requiredText(60),
      lastName: v.requiredText(60),
      phone: v.phone(false),
      specialization: v.optionalText(120),
      bio: v.optionalText(2000),
      certifications: v.optionalText(1000),
      hiredAt: v.isoDate(false),
      email: z.string().optional(),
      password: z.string().optional(),
    },
    !editing,
    { email: v.email(), password: v.password() },
  );

  const form = useForm<TrainerFormValues>({
    resolver: zodResolver(schema) as Resolver<TrainerFormValues>,
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      specialization: '',
      bio: '',
      certifications: '',
      hiredAt: '',
      email: '',
      password: '',
    },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  const create = useCreateTrainer();
  const update = useUpdateTrainer(trainer?.id ?? '');
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: trainer?.account.firstName ?? '',
      lastName: trainer?.account.lastName ?? '',
      phone: trainer?.account.phone ?? '',
      specialization: trainer?.specialization ?? '',
      bio: trainer?.bio ?? '',
      certifications: trainer?.certifications ?? '',
      hiredAt: trainer?.hiredAt ? trainer.hiredAt.slice(0, 10) : '',
      email: '',
      password: '',
    });
    clearFormError();
  }, [open, trainer, reset, clearFormError]);

  const submit = form.handleSubmit(async (values) => {
    clearFormError();
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === undefined) continue;
      if (editing && (key === 'email' || key === 'password')) continue;
      body[key] = value;
    }
    try {
      const saved = await mutation.mutateAsync(body);
      toast.success(editing ? t('updated') : t('created'));
      if (!editing) onCreated?.(saved);
      else onClose();
    } catch (error) {
      handleError(error);
    }
  });

  const two = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } };

  return (
    <FormDialog
      open={open}
      title={editing ? t('editTitle') : t('createTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('create')}
      onClose={onClose}
      onSubmit={submit}
      submitting={mutation.isPending}
      error={formError}
      maxWidth="md"
    >
      <Box sx={two}>
        <TextInput control={form.control} name="firstName" label={tf('firstName')} required autoFocus />
        <TextInput control={form.control} name="lastName" label={tf('lastName')} required />
      </Box>

      {!editing ? (
        <>
          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              {tc('labels.account')}
            </Typography>
          </Divider>
          <Box sx={two}>
            <TextInput control={form.control} name="email" label={tf('email')} required type="email" />
            <PasswordField
              register={form.register('password')}
              label={tf('password')}
              error={form.formState.errors.password?.message}
              autoComplete="new-password"
              showStrength
              value={form.watch('password') ?? ''}
            />
          </Box>
        </>
      ) : null}

      <Box sx={two}>
        <TextInput control={form.control} name="phone" label={tf('phone')} />
        <TextInput control={form.control} name="specialization" label={tf('specialization')} />
        <DateInput
          control={form.control}
          name="hiredAt"
          label={tf('hiredAt')}
          max={toIsoDate(new Date())}
        />
      </Box>
      <TextInput control={form.control} name="certifications" label={tf('certifications')} multiline rows={2} />
      <TextInput control={form.control} name="bio" label={tf('bio')} multiline rows={3} />
    </FormDialog>
  );
}
