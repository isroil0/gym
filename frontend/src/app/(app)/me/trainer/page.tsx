import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyTrainer } from '@/features/member-portal/MyTrainer';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return { title: t('myTrainer') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MyTrainer />
    </Suspense>
  );
}
