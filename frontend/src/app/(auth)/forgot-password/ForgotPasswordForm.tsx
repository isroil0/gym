'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { validators } from '@/lib/forms/validators';

/**
 * Request a reset link.
 *
 * Succeeds identically whether or not the address is registered — the backend
 * is deliberately silent about which, and the UI must not undo that by saying
 * "no such user".
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const tl = useTranslations('auth.login');
  const tv = useTranslations('validation');
  const te = useTranslations('errors');
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const v = validators(tv);
  const schema = z.object({ email: v.email() });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('auth/forgot-password', { email: values.email.trim() });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.isRateLimited) {
        setFormError(tl('rateLimited'));
        return;
      }
      setFormError(te('generic'));
    }
  });

  if (sent) {
    return (
      <Card sx={{ boxShadow: (theme) => theme.elevation.sm }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <MarkEmailReadIcon sx={{ fontSize: 40, color: 'success.main', mb: 1.5 }} />
          <Typography variant="h3" component="h1">
            {t('sentTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {t('sent')}
          </Typography>
          <Button component={Link} href="/login" variant="outlined" fullWidth>
            {t('backToLogin')}
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

            <TextField
              {...form.register('email')}
              label={t('email')}
              type="email"
              autoComplete="username"
              autoFocus
              fullWidth
              disabled={busy}
              error={Boolean(form.formState.errors.email)}
              helperText={form.formState.errors.email?.message}
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

            <MuiLink
              component={Link}
              href="/login"
              variant="body2"
              underline="hover"
              sx={{ alignSelf: 'center' }}
            >
              {t('backToLogin')}
            </MuiLink>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
