'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import { loginRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { validators } from '@/lib/forms/validators';

/**
 * Sign in.
 *
 * The three outcomes the backend distinguishes are shown differently, because
 * they need different actions from the reader: wrong password (try again),
 * inactive account (call the gym), too many attempts (wait).
 */
export function LoginForm() {
  const t = useTranslations('auth.login');
  const tv = useTranslations('validation');
  const te = useTranslations('errors');
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const v = validators(tv);
  const schema = z.object({
    email: v.email(),
    // No strength rules on sign-in: the password already exists, and telling
    // somebody their stored password is "too short" helps nobody.
    password: z.string().min(1, tv('required')),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await loginRequest(values.email.trim(), values.password);
      const next = params.get('next');
      // Only ever resume a path inside this application.
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(target);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) setFormError(t('invalidCredentials'));
        else if (error.status === 403) setFormError(t('accountInactive'));
        else if (error.isRateLimited) setFormError(t('rateLimited'));
        else if (error.status === 0 || error.status >= 500) setFormError(te('network'));
        else setFormError(error.message || te('generic'));
        form.setValue('password', '');
        form.setFocus('password');
        return;
      }
      setFormError(te('generic'));
    }
  });

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
              slotProps={{ htmlInput: { enterKeyHint: 'next', inputMode: 'email' } }}
            />

            <TextField
              {...form.register('password')}
              label={t('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              fullWidth
              disabled={busy}
              error={Boolean(form.formState.errors.password)}
              helperText={form.formState.errors.password?.message}
              slotProps={{
                htmlInput: { enterKeyHint: 'go' },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((current) => !current)}
                        edge="end"
                        size="small"
                        aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      >
                        {showPassword ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {busy ? t('submitting') : t('submit')}
            </Button>

            <MuiLink
              component={Link}
              href="/forgot-password"
              variant="body2"
              underline="hover"
              sx={{ alignSelf: 'center' }}
            >
              {t('forgot')}
            </MuiLink>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
