import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SessionsPage } from '@/features/sessions/SessionsPage';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SessionsPage />
    </Suspense>
  );
}
