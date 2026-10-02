import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyProgress } from '@/features/member-portal/MyProgress';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('progress');
  return { title: t('myProgress') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MyProgress />
    </Suspense>
  );
}
