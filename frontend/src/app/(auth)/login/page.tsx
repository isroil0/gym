import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Skeleton from '@mui/material/Skeleton';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary for static generation.
    <Suspense fallback={<Skeleton variant="rounded" height={380} sx={{ borderRadius: 3 }} />}>
      <LoginForm />
    </Suspense>
  );
}
