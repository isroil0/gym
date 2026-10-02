import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getCurrentUser } from '@/lib/auth/session.server';
import { homeFor } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/api/types';

export default async function NotFound() {
  const t = await getTranslations('common.states');
  const ta = await getTranslations('auth.guard');
  const user = await getCurrentUser();

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', p: 3 }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', maxWidth: 420 }}>
        <Typography variant="h1" sx={{ fontSize: '2.5rem' }}>
          404
        </Typography>
        <Typography variant="h3">{t('notFound')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('notFoundHint')}
        </Typography>
        <Button component={Link} href={user ? homeFor(user.role as UserRole) : '/login'} variant="contained">
          {user ? ta('goHome') : 'Sign in'}
        </Button>
      </Stack>
    </Box>
  );
}
