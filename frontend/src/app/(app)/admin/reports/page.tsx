import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { MetricCardSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === 'string' ? params.view : 'revenue';
  return (
    <Suspense fallback={<MetricCardSkeleton count={3} />}>
      <ReportsPage tab={view} />
    </Suspense>
  );
}
