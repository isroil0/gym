'use client';

import { useTranslations } from 'next-intl';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { PageHeader } from '@/components/ui/PageHeader';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useMyWorkoutPlans } from '@/features/workouts/useWorkouts';
import { WorkoutPlanEditor } from '@/features/workouts/WorkoutPlanEditor';

/** The member's training programme, read-only. */
export function MyWorkout() {
  const t = useTranslations('workouts');
  const { data, isPending } = useMyWorkoutPlans();

  if (isPending) return <DetailSkeleton />;

  const active = (data?.data ?? []).find((plan) => plan.status === 'ACTIVE') ?? data?.data[0];

  if (!active) {
    return (
      <>
        <PageHeader title={t('myPlan')} />
        <Card>
          <CardContent>
            <EmptyState title={t('empty.member')} body={t('empty.memberHint')} />
          </CardContent>
        </Card>
      </>
    );
  }

  // The same editor the trainer uses, with every control removed.
  return <WorkoutPlanEditor planId={active.id} readOnly />;
}
