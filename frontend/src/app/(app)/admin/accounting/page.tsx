import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AccountingPage } from '@/features/accounting/AccountingPage';
import { MetricCardSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('accounting');
  return { title: t('title') };
}

export default async function Accounting({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === 'string' ? params.view : 'overview';
  return (
    <Suspense fallback={<MetricCardSkeleton count={4} />}>
      <AccountingPage tab={view} />
    </Suspense>
  );
}
