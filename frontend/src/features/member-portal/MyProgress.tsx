'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressPanel } from '@/features/progress/ProgressPanel';
import { useMyProgress } from '@/features/progress/useProgress';

/** The member's own measurements. */
export function MyProgress() {
  const t = useTranslations('progress');
  const { data, isPending } = useMyProgress();

  return (
    <>
      <PageHeader title={t('myProgress')} subtitle={t('subtitle')} />
      <ProgressPanel
        progress={data}
        isPending={isPending}
        emptyTitle={t('empty.member')}
        emptyBody={t('empty.memberHint')}
      />
    </>
  );
}
