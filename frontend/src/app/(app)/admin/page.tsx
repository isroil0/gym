import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminDashboard } from '@/features/dashboard/AdminDashboard';
import { Hydrate, prefetch } from '@/lib/server/prefetch';
import { keys } from '@/lib/api/keys';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.admin');
  return { title: t('title') };
}

export default async function AdminDashboardPage() {
  // The headline figures are fetched here so the page arrives with its
  // numbers already on it. The two charts load in the browser; they depend on
  // a date window the reader can change, and are below the fold anyway.
  const client = await prefetch([{ key: keys.dashboards.admin, path: 'dashboard/admin' }]);

  return (
    <Hydrate client={client}>
      <AdminDashboard />
    </Hydrate>
  );
}
