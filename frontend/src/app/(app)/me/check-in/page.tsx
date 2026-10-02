import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SelfCheckIn } from '@/features/member-portal/SelfCheckIn';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('attendance.selfScan');
  return { title: t('title') };
}

export default function Page() {
  return <SelfCheckIn />;
}
