import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WorkoutPlanList } from '@/features/workouts/WorkoutPlanList';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workouts');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <WorkoutPlanList />
    </Suspense>
  );
}
