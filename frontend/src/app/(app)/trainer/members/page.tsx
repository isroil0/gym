import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrainerMembers } from '@/features/trainer-portal/TrainerMembers';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return { title: t('myMembers') };
}

export default function TrainerMembersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <TrainerMembers />
    </Suspense>
  );
}
