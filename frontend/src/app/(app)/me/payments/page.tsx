import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyPayments } from '@/features/member-portal/MyPayments';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payments');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MyPayments />
    </Suspense>
  );
}
