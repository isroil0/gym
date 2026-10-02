import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MemberDetail } from '@/features/members/MemberDetail';
import { DetailSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members');
  return { title: t('one') };
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MemberDetail memberId={id} />
    </Suspense>
  );
}
