import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaymentList } from '@/features/payments/PaymentList';
import { TableSkeleton } from '@/components/feedback/Skeletons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payments');
  return { title: t('title') };
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PaymentList />
    </Suspense>
  );
}
