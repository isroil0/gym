import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrainerDashboard } from '@/features/dashboard/TrainerDashboard';
import { Hydrate, prefetch } from '@/lib/server/prefetch';
import { keys } from '@/lib/api/keys';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.trainer');
  return { title: t('title') };
}

export default async function TrainerDashboardPage() {
  const client = await prefetch([{ key: keys.dashboards.trainer, path: 'dashboard/trainer' }]);
  return (
    <Hydrate client={client}>
      <TrainerDashboard />
    </Hydrate>
  );
}
