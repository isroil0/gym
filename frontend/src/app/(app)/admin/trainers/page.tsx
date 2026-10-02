import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrainerList } from '@/features/trainers/TrainerList';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trainers');
  return { title: t('title') };
}

export default function TrainersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <TrainerList />
    </Suspense>
  );
}
