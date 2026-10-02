import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MemberHome } from '@/features/member-portal/MemberHome';
import { Hydrate, prefetch } from '@/lib/server/prefetch';
import { keys } from '@/lib/api/keys';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return { title: t('home') };
}

export default async function Page() {
  // The home screen is what a member opens at the door; it arrives with its
  // numbers already filled in rather than a column of skeletons.
  const client = await prefetch([{ key: keys.dashboards.member, path: 'dashboard/member' }]);
  return (
    <Hydrate client={client}>
      <MemberHome />
    </Hydrate>
  );
}
