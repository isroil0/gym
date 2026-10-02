import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { AuditLog } from '@/features/audit/AuditLog';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.audit');
  return { title: t('title') };
}

export default async function Page() {
  const t = await getTranslations('settings.audit');
  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        crumbs={[{ label: t('title') }]}
      />
      <Suspense fallback={<TableSkeleton />}>
        <AuditLog />
      </Suspense>
    </>
  );
}
