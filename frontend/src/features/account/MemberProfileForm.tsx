'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { validators } from '@/lib/forms/validators';
import { TextInput } from '@/components/forms/fields';
import { useFormErrorHandler } from '@/lib/forms/useApiForm';
import { useToast } from '@/providers/ToastProvider';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import type { Member } from '@/lib/api/types';

/**
 * The four fields a member may change about themselves.
 *
 * Exactly the set `PATCH /members/me` accepts — name, date of birth and the
 * rest are the gym's record to keep, not the member's to edit.
 */
export function MemberProfileForm() {
  const t = useTranslations('members.fields');
  const tm = useTranslations('members');
  const tv = useTranslations('validation');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: keys.members.me,
    queryFn: () => api.get<Member>('members/me'),
  });

  const v = validators(tv);
  const schema = z.object({
    phone: v.phone(false),
    address: v.optionalText(255),
    emergencyContactName: v.optionalText(120),
    emergencyContactPhone: v.phone(false),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', address: '', emergencyContactName: '', emergencyContactPhone: '' },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  useEffect(() => {
    if (!data) return;
    reset({
      phone: data.account?.phone ?? '',
      address: data.address ?? '',
      emergencyContactName: data.emergencyContactName ?? '',
      emergencyContactPhone: data.emergencyContactPhone ?? '',
    });
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      // Empty strings are omitted: the backend treats an absent key as
      // "leave alone" and rejects an empty string on a min-length field.
      api.patch<Member>('members/me', omitEmpty(values)),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.members.me, updated);
      toast.success(tm('profileUpdated'));
      form.reset(form.getValues());
    },
    onError: handleError,
  });

  if (isPending) return <DetailSkeleton />;
  if (isError) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h4" sx={{ mb: 2.5 }}>
          {tm('detail.contact')}
        </Typography>

        <form
          onSubmit={form.handleSubmit((values) => {
            clearFormError();
            mutation.mutate(values);
          })}
          noValidate
        >
          <Stack spacing={2} sx={{ maxWidth: 520 }}>
            {formError ? (
              <Alert severity="error" variant="outlined" role="alert">
                {formError}
              </Alert>
            ) : null}

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              <TextInput control={form.control} name="phone" label={t('phone')} />
              <TextInput control={form.control} name="address" label={t('address')} />
              <TextInput
                control={form.control}
                name="emergencyContactName"
                label={t('emergencyContactName')}
              />
              <TextInput
                control={form.control}
                name="emergencyContactPhone"
                label={t('emergencyContactPhone')}
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              disabled={mutation.isPending || !form.formState.isDirty}
              startIcon={
                mutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              {ta('saveChanges')}
            </Button>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}

function omitEmpty<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== '' && value !== undefined),
  ) as Partial<T>;
}
