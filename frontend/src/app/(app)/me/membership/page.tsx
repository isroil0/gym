import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyMembership } from '@/features/member-portal/MyMembership';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return { title: t('myMembership') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MyMembership />
    </Suspense>
  );
}
