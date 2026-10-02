import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyWorkout } from '@/features/member-portal/MyWorkout';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workouts');
  return { title: t('myPlan') };
}

export default function Page() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MyWorkout />
    </Suspense>
  );
}
