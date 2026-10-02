'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { matchPasswords, validators } from '@/lib/forms/validators';
import { PasswordField } from '@/components/forms/PasswordField';
import { useToast } from '@/providers/ToastProvider';

/** Change your own password. Available to every role. */
export function ChangePasswordCard() {
  const t = useTranslations('auth.changePassword');
  const tv = useTranslations('validation');
  const te = useTranslations('errors');
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const v = validators(tv);
  const schema = matchPasswords(
    z.object({
      currentPassword: z.string().min(1, tv('required')),
      newPassword: v.password(),
      confirmPassword: z.string().min(1, tv('required')),
    }),
    tv,
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      form.reset();
      toast.success(t('success'));
    } catch (error) {
      if (error instanceof ApiError) {
        // A refused current password belongs on that field, not in a banner.
        if (error.status === 401 || error.status === 403) {
          form.setError('currentPassword', { type: 'server', message: t('wrongCurrent') });
          form.setFocus('currentPassword');
          return;
        }
        const field = error.fieldErrors.newPassword;
        if (field) {
          form.setError('newPassword', { type: 'server', message: field });
          return;
        }
        setFormError(error.message || te('generic'));
        return;
      }
      setFormError(te('generic'));
    }
  });

  const busy = form.formState.isSubmitting;

  return (
    <Card>
      <CardContent>
        <Typography variant="h4" sx={{ mb: 2 }}>
          {t('title')}
        </Typography>
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2} sx={{ maxWidth: 420 }}>
            {formError ? (
              <Alert severity="error" variant="outlined" role="alert">
                {formError}
              </Alert>
            ) : null}

            <PasswordField
              register={form.register('currentPassword')}
              label={t('currentPassword')}
              error={form.formState.errors.currentPassword?.message}
              autoComplete="current-password"
              disabled={busy}
            />
            <PasswordField
              register={form.register('newPassword')}
              label={t('newPassword')}
              helperText={t('hint')}
              error={form.formState.errors.newPassword?.message}
              autoComplete="new-password"
              showStrength
              value={form.watch('newPassword')}
              disabled={busy}
            />
            <PasswordField
              register={form.register('confirmPassword')}
              label={t('confirmPassword')}
              error={form.formState.errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={busy}
            />

            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('submit')}
            </Button>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
