import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LockIcon from '@mui/icons-material/LockOutlined';
import { requireUser } from '@/lib/auth/guards.server';
import { homeFor } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/api/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.guard');
  return { title: t('forbiddenTitle') };
}

export default async function ForbiddenPage() {
  const t = await getTranslations('auth.guard');
  const user = await requireUser();

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '55vh' }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', maxWidth: 420 }}>
        <Box
          aria-hidden
          sx={{
            width: 52,
            height: 52,
            borderRadius: 2.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'background.sunken',
            color: 'text.secondary',
          }}
        >
          <LockIcon />
        </Box>
        <Typography variant="h2">{t('forbiddenTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('forbiddenBody')}
        </Typography>
        <Button component={Link} href={homeFor(user.role as UserRole)} variant="contained">
          {t('goHome')}
        </Button>
      </Stack>
    </Box>
  );
}
