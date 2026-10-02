import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Stack from '@mui/material/Stack';
import { PageHeader } from '@/components/ui/PageHeader';
import { IdentityCard } from '@/features/account/IdentityCard';
import { TrainerProfileForm } from '@/features/account/TrainerProfileForm';
import { ChangePasswordCard } from '@/features/account/ChangePasswordCard';
import { AppearanceCard } from '@/features/account/AppearanceCard';
import { SecurityCard } from '@/features/account/SecurityCard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return { title: t('profile') };
}

export default async function TrainerProfilePage() {
  const t = await getTranslations('settings');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Stack spacing={2.5} sx={{ maxWidth: 820 }}>
        <IdentityCard showReadOnlyNotice />
        <TrainerProfileForm />
        <AppearanceCard />
        <ChangePasswordCard />
        <SecurityCard />
      </Stack>
    </>
  );
}
