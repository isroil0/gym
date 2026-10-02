import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Skeleton from '@mui/material/Skeleton';
import { ResetPasswordForm } from './ResetPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.resetPassword');
  return { title: t('title') };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton variant="rounded" height={360} sx={{ borderRadius: 3 }} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
