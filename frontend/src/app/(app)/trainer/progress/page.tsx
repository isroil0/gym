import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrainerProgressPage } from '@/features/trainer-portal/TrainerProgressPage';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('progress');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TrainerProgressPage />
    </Suspense>
  );
}
