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
import { TextInput, SelectInput, DateInput } from '@/components/forms/fields';
import { PasswordField } from '@/components/forms/PasswordField';
import { requiredWhen, validators } from '@/lib/forms/validators';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { useCreateMember, useUpdateMember } from './useMembers';
import { GENDERS, type Member } from '@/lib/api/types';
import { toIsoDate } from '@/lib/format/datetime';

/**
 * Create or edit a member.
 *
 * Creating also provisions a sign-in account, which is why a password is
 * asked for once and never again: editing touches only the profile, because
 * that is all `PATCH /members/{id}` accepts.
 */
export interface MemberFormValues {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  email?: string;
  password?: string;
}

export function MemberFormDialog({
  open,
  onClose,
  onCreated,
  member,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (member: Member) => void;
  member?: Member;
}) {
  const t = useTranslations('members');
  const tf = useTranslations('members.fields');
  const tc = useTranslations('common');
  const ta = useTranslations('common.actions');
  const tv = useTranslations('validation');
  const toast = useToast();
  const editing = Boolean(member);

  const v = validators(tv);
  const base = {
    firstName: v.requiredText(60),
    lastName: v.requiredText(60),
    phone: v.phone(false),
    dateOfBirth: v.isoDate(false),
    gender: z.enum(['', ...GENDERS] as [string, ...string[]]).optional(),
    address: v.optionalText(255),
    emergencyContactName: v.optionalText(120),
    emergencyContactPhone: v.phone(false),
    notes: v.optionalText(2000),
  };
  // The account fields exist only when creating; they are validated only
  // then, so the form keeps one stable type and every field a real name.
  const schema = requiredWhen(
    { ...base, email: z.string().optional(), password: z.string().optional() },
    !editing,
    { email: v.email(), password: v.password() },
  );

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(schema) as Resolver<MemberFormValues>,
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      notes: '',
      email: '',
      password: '',
    },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  const create = useCreateMember();
  const update = useUpdateMember(member?.id ?? '');
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: member?.account.firstName ?? '',
      lastName: member?.account.lastName ?? '',
      phone: member?.account.phone ?? '',
      dateOfBirth: member?.dateOfBirth ? member.dateOfBirth.slice(0, 10) : '',
      gender: member?.gender ?? '',
      address: member?.address ?? '',
      emergencyContactName: member?.emergencyContactName ?? '',
      emergencyContactPhone: member?.emergencyContactPhone ?? '',
      notes: member?.notes ?? '',
      email: '',
      password: '',
    });
    clearFormError();
  }, [open, member, reset, clearFormError]);

  const submit = form.handleSubmit(async (values) => {
    clearFormError();
    // Blank optional fields are dropped: the backend reads an absent key as
    // "unchanged" and rejects an empty string on a min-length field.
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
            <TextInput
              control={form.control}
              name="email"
              label={tf('email')}
              required
              type="email"
            />
            <PasswordField
              register={form.register('password')}
              label={tf('password')}
              helperText={tf('passwordHint')}
              error={form.formState.errors.password?.message}
              autoComplete="new-password"
              showStrength
              value={form.watch('password') ?? ''}
            />
          </Box>
        </>
      ) : null}

      <Divider textAlign="left">
        <Typography variant="caption" color="text.secondary">
          {t('detail.personal')}
        </Typography>
      </Divider>
      <Box sx={two}>
        <TextInput control={form.control} name="phone" label={tf('phone')} />
        <DateInput
          control={form.control}
          name="dateOfBirth"
          label={tf('dateOfBirth')}
          max={toIsoDate(new Date())}
        />
        <SelectInput
          control={form.control}
          name="gender"
          label={tf('gender')}
          emptyLabel={tc('labels.none')}
          options={GENDERS.map((value) => ({ value, label: tc(`gender.${value}`) }))}
        />
        <TextInput control={form.control} name="address" label={tf('address')} />
      </Box>

      <Divider textAlign="left">
        <Typography variant="caption" color="text.secondary">
          {t('detail.emergency')}
        </Typography>
      </Divider>
      <Box sx={two}>
        <TextInput
          control={form.control}
          name="emergencyContactName"
          label={tf('emergencyContactName')}
        />
        <TextInput
          control={form.control}
          name="emergencyContactPhone"
          label={tf('emergencyContactPhone')}
        />
      </Box>

      <TextInput
        control={form.control}
        name="notes"
        label={tf('notes')}
        helperText={tf('notesHint')}
        multiline
        rows={3}
      />
    </FormDialog>
  );
}
