'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import AddIcon from '@mui/icons-material/AddRounded';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { DetailSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate, formatDateTime } from '@/lib/format/datetime';
import { useMember } from '@/features/members/useMembers';
import { useWorkoutPlanList } from '@/features/workouts/useWorkouts';
import { useMemberProgress } from '@/features/progress/useProgress';
import { useAttendanceList } from '@/features/attendance/useAttendance';
import { ProgressPanel } from '@/features/progress/ProgressPanel';
import { MeasurementDialog } from '@/features/progress/MeasurementDialog';
import { PlanDialog } from '@/features/workouts/WorkoutDialogs';

/**
 * One of the trainer's members.
 *
 * Shows only what a trainer is permitted to see: contact details, their
 * programmes, their measurements and their attendance. No money, and no
 * internal staff notes — the backend omits both from a trainer's view.
 */
export function TrainerMemberDetail({ memberId }: { memberId: string }) {
  const t = useTranslations('members');
  const tw = useTranslations('workouts');
  const tp = useTranslations('progress');
  const tat = useTranslations('attendance');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();
  const tab = useSearchParams().get('tab') ?? 'overview';

  const [recording, setRecording] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const { data: member, isPending, isError, refetch } = useMember(memberId);
  const plans = useWorkoutPlanList({ memberId, limit: '20' });
  const progress = useMemberProgress(tab === 'progress' ? memberId : '');
  const attendance = useAttendanceList({ memberId, limit: '20' });

  if (isPending) return <DetailSkeleton />;
  if (isError || !member) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('notFound')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  const name = `${member.account.firstName} ${member.account.lastName}`;

  return (
    <>
      <PageHeader
        title={name}
        subtitle={member.memberCode}
        crumbs={[{ label: t('title'), href: '/trainer/members' }, { label: name }]}
        actions={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setRecording(true)}
            >
              {tp('record')}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setCreatingPlan(true)}
            >
              {tw('create')}
            </Button>
          </>
        }
      />

      <TabbedSection
        tabs={[
          { value: 'overview', label: t('tabs.overview') },
          { value: 'workouts', label: t('tabs.workouts'), badge: plans.data?.meta.total },
          { value: 'progress', label: t('tabs.progress') },
          { value: 'attendance', label: t('tabs.attendance') },
        ]}
        active={tab}
      >
        {tab === 'workouts' ? (
          plans.isPending ? (
            <ListSkeleton rows={3} />
          ) : (plans.data?.data.length ?? 0) === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  title={tw('empty.title')}
                  body={tw('empty.body')}
                  action={
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreatingPlan(true)}>
                      {tw('create')}
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1.5}>
              {plans.data!.data.map((plan) => (
                <Card key={plan.id}>
                  <CardContent sx={{ py: 2 }}>
                    <Stack
                      component={Link}
                      href={`/trainer/workout-plans/${plan.id}`}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1.5}
                      sx={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 560 }} noWrap>
                          {plan.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {tw('dayCount', { count: plan.dayCount })} ·{' '}
                          {tw('exerciseCount', { count: plan.exerciseCount })}
                          {plan.goal ? ` · ${plan.goal}` : ''}
                        </Typography>
                      </Box>
                      <StatusChip
                        label={tw(`status.${plan.status}`)}
                        tone={plan.status === 'ACTIVE' ? 'success' : 'neutral'}
                      />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )
        ) : null}

        {tab === 'progress' ? (
          <ProgressPanel
            progress={progress.data}
            isPending={progress.isPending}
            emptyTitle={tp('empty.title')}
            emptyBody={tp('empty.body')}
            action={
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setRecording(true)}>
                {tp('record')}
              </Button>
            }
          />
        ) : null}

        {tab === 'attendance' ? (
          <Card>
            <CardContent>
              {attendance.isPending ? (
                <ListSkeleton rows={5} />
              ) : (attendance.data?.data.length ?? 0) === 0 ? (
                <EmptyState title={tat('empty.title')} compact />
              ) : (
                <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {attendance.data!.data.map((visit) => (
                    <Box
                      component="li"
                      key={visit.id}
                      sx={{
                        py: 1.25,
                        '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                        <Typography variant="body2">
                          {formatDateTime(visit.checkedInAt, locale)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {visit.stillInside ? `${tat('stillInside')} · ` : ''}
                          {tat(`method.${visit.method}`)}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === 'overview' ? (
          <Card>
            <CardContent>
              <DefinitionList
                columns={3}
                items={[
                  { label: tc('labels.email'), value: member.account.email },
                  { label: tc('labels.phone'), value: member.account.phone },
                  { label: tc('labels.created'), value: formatDate(member.joinedAt, locale, 'long') },
                  {
                    label: tc('labels.dateOfBirth'),
                    value: member.dateOfBirth ? formatDate(member.dateOfBirth, locale, 'long') : null,
                  },
                  {
                    label: tc('labels.gender'),
                    value: member.gender ? tc(`gender.${member.gender}`) : null,
                  },
                  { label: t('detail.emergency'), value: member.emergencyContactPhone },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}
      </TabbedSection>

      <MeasurementDialog open={recording} member={member} onClose={() => setRecording(false)} />
      <PlanDialog open={creatingPlan} member={member} onClose={() => setCreatingPlan(false)} />
    </>
  );
}
