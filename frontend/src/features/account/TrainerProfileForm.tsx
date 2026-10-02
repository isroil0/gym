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
import type { Trainer } from '@/lib/api/types';

/** The fields `PATCH /trainers/me` accepts — and no others. */
export function TrainerProfileForm() {
  const t = useTranslations('trainers.fields');
  const tt = useTranslations('trainers');
  const tv = useTranslations('validation');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: keys.trainers.me,
    queryFn: () => api.get<Trainer>('trainers/me'),
  });

  const v = validators(tv);
  const schema = z.object({
    phone: v.phone(false),
    specialization: v.optionalText(120),
    bio: v.optionalText(2000),
    certifications: v.optionalText(1000),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', specialization: '', bio: '', certifications: '' },
  });
  const { formError, handleError, clearFormError } = useFormErrorHandler(form);
  const { reset } = form;

  useEffect(() => {
    if (!data) return;
    reset({
      phone: data.account?.phone ?? '',
      specialization: data.specialization ?? '',
      bio: data.bio ?? '',
      certifications: data.certifications ?? '',
    });
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api.patch<Trainer>(
        'trainers/me',
        Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.trainers.me, updated);
      toast.success(tt('updated'));
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
          {tt('edit')}
        </Typography>

        <form
          onSubmit={form.handleSubmit((values) => {
            clearFormError();
            mutation.mutate(values);
          })}
          noValidate
        >
          <Stack spacing={2} sx={{ maxWidth: 560 }}>
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
              <TextInput
                control={form.control}
                name="specialization"
                label={t('specialization')}
              />
            </Box>
            <TextInput
              control={form.control}
              name="certifications"
              label={t('certifications')}
              multiline
              rows={2}
            />
            <TextInput control={form.control} name="bio" label={t('bio')} multiline rows={4} />

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
