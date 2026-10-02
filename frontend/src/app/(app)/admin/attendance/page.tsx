import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { MetricCardSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('attendance');
  return { title: t('title') };
}

export default async function Attendance({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === 'string' ? params.view : 'today';
  return (
    <Suspense fallback={<MetricCardSkeleton count={2} />}>
      <AttendancePage tab={view} />
    </Suspense>
  );
}
