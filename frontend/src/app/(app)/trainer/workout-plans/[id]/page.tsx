import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WorkoutPlanEditor } from '@/features/workouts/WorkoutPlanEditor';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workouts');
  return { title: t('one') };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <WorkoutPlanEditor planId={id} backHref="/trainer/workout-plans" />
    </Suspense>
  );
}
