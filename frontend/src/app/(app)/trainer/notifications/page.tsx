import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ListSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <NotificationsPage canAnnounce={false} />
    </Suspense>
  );
}
