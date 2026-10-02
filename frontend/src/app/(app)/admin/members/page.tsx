import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MemberList } from '@/features/members/MemberList';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members');
  return { title: t('title') };
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<TableSkeleton />}>
      <MemberList openNew={params.new === '1'} />
    </Suspense>
  );
}
