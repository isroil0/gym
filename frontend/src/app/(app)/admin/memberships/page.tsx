import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MembershipList } from '@/features/memberships/MembershipList';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('memberships');
  return { title: t('title') };
}

export default async function MembershipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === 'string' ? params.view : 'memberships';
  return (
    <Suspense fallback={<TableSkeleton />}>
      <MembershipList tab={view} />
    </Suspense>
  );
}
