import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MemberCard } from '@/features/member-portal/MemberCard';
import { Hydrate, prefetch } from '@/lib/server/prefetch';
import { keys } from '@/lib/api/keys';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('attendance.card');
  return { title: t('title') };
}

export default async function Page() {
  // This page is opened at the turnstile with somebody waiting behind. The
  // card is fetched on the server so the code is on screen in the first
  // paint rather than after a round trip.
  const client = await prefetch([{ key: keys.cards.me, path: 'membership-cards/me' }]);
  return (
    <Hydrate client={client}>
      <MemberCard />
    </Hydrate>
  );
}
