'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/AddRounded';
import { PageHeader } from '@/components/ui/PageHeader';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { ProgressPanel } from '@/features/progress/ProgressPanel';
import { MeasurementDialog } from '@/features/progress/MeasurementDialog';
import { useMemberProgress } from '@/features/progress/useProgress';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { Member } from '@/lib/api/types';

/** Pick one of your members and look at how they are getting on. */
export function TrainerProgressPage() {
  const t = useTranslations('progress');
  const tf = useTranslations('progress.fields');
  const [member, setMember] = useState<Member | null>(null);
  const [recording, setRecording] = useState(false);

  const progress = useMemberProgress(member?.id ?? '');

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setRecording(true)}
          >
            {t('record')}
          </Button>
        }
      />

      <Stack spacing={2.5}>
        <Card>
          <CardContent sx={{ py: 2 }}>
            <MemberPicker value={member} onChange={setMember} label={tf('member')} autoFocus />
          </CardContent>
        </Card>

        {member ? (
          <ProgressPanel
            progress={progress.data}
            isPending={progress.isPending}
            emptyTitle={t('empty.title')}
            emptyBody={t('empty.body')}
            action={
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setRecording(true)}>
                {t('record')}
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent>
              <EmptyState title={t('chart.selectMetric')} body={t('subtitle')} />
            </CardContent>
          </Card>
        )}
      </Stack>

      <MeasurementDialog
        open={recording}
        member={member ?? undefined}
        onClose={() => setRecording(false)}
      />
    </>
  );
}
