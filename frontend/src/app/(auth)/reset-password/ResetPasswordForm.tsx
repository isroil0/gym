'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { validators, matchPasswords } from '@/lib/forms/validators';
import { PasswordField } from '@/components/forms/PasswordField';

export function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const tc = useTranslations('auth.changePassword');
  const tv = useTranslations('validation');
  const te = useTranslations('errors');
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const v = validators(tv);
  const schema = matchPasswords(
    z.object({ newPassword: v.password(), confirmPassword: z.string().min(1, tv('required')) }),
    tv,
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('auth/reset-password', { token, newPassword: values.newPassword });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        // The backend answers an unknown, used or expired token the same way,
        // and so does this message: there is nothing to tell apart.
        if (error.status === 400 || error.status === 401 || error.status === 404) {
          setFormError(t('invalidToken'));
          return;
        }
        const field = error.fieldErrors.newPassword;
        if (field) {
          form.setError('newPassword', { type: 'server', message: field });
          return;
        }
      }
      setFormError(te('generic'));
    }
  });

  if (!token) {
    return (
      <Card sx={{ boxShadow: (theme) => theme.elevation.sm }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <Typography variant="h3" component="h1" sx={{ mb: 1 }}>
            {t('title')}
          </Typography>
          <Alert severity="error" variant="outlined" sx={{ mb: 3, textAlign: 'start' }}>
            {t('invalidToken')}
          </Alert>
          <Button component={Link} href="/forgot-password" variant="contained" fullWidth>
            {t('requestNew')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card sx={{ boxShadow: (theme) => theme.elevation.sm }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1.5 }} />
          <Typography variant="h3" component="h1">
            {t('title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {t('success')}
          </Typography>
          <Button onClick={() => router.replace('/login')} variant="contained" fullWidth>
            {t('submit')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const busy = form.formState.isSubmitting;

  return (
    <Card sx={{ boxShadow: (theme) => theme.elevation.sm }}>
      <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h2" component="h1">
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
          {t('subtitle')}
        </Typography>

        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            {formError ? (
              <Alert severity="error" variant="outlined" role="alert">
                {formError}
              </Alert>
            ) : null}

            <PasswordField
              register={form.register('newPassword')}
              label={t('newPassword')}
              helperText={tc('hint')}
              error={form.formState.errors.newPassword?.message}
              autoComplete="new-password"
              autoFocus
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
              size="large"
              fullWidth
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {t('submit')}
            </Button>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
