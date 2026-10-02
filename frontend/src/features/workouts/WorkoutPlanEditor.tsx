'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineRounded';
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import { AnimatePresence, m } from 'motion/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { DayDialog, ExerciseDialog, PlanDialog } from './WorkoutDialogs';
import {
  useArchiveWorkoutPlan,
  useDeleteDay,
  useDeleteExercise,
  useWorkoutPlan,
} from './useWorkouts';
import type { Schemas } from '@/lib/api/types';

type Day = Schemas['WorkoutDayResponseDto'];
type Exercise = Schemas['WorkoutExerciseResponseDto'];

/**
 * A training programme, day by day.
 *
 * Read-only for a member, editable for the trainer who owns it. Every edit
 * endpoint returns the whole plan, so the screen always redraws from the
 * server's answer instead of a local guess about what changed.
 */
export function WorkoutPlanEditor({
  planId,
  readOnly = false,
  backHref,
}: {
  planId: string;
  readOnly?: boolean;
  backHref?: string;
}) {
  const t = useTranslations('workouts');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const toast = useToast();
  const describe = useApiErrorMessage();

  const [editingPlan, setEditingPlan] = useState(false);
  const [addingDay, setAddingDay] = useState(false);
  const [editingDay, setEditingDay] = useState<Day | null>(null);
  const [deletingDay, setDeletingDay] = useState<Day | null>(null);
  const [addingExerciseTo, setAddingExerciseTo] = useState<Day | null>(null);
  const [editingExercise, setEditingExercise] = useState<{ day: Day; exercise: Exercise } | null>(null);
  const [deletingExercise, setDeletingExercise] = useState<{ day: Day; exercise: Exercise } | null>(null);
  const [archiving, setArchiving] = useState(false);

  const { data: plan, isPending, isError, refetch } = useWorkoutPlan(planId);
  const archive = useArchiveWorkoutPlan(planId);
  const deleteDay = useDeleteDay(planId);
  const deleteExercise = useDeleteExercise(planId, deletingExercise?.day.id ?? '');

  if (isPending) return <DetailSkeleton />;
  if (isError || !plan) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('notFound')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  const archived = plan.status === 'ARCHIVED';
  const editable = !readOnly && !archived;
  // `days` is only populated on the detail endpoint; treat its absence as
  // an empty programme rather than crashing on a list-shaped response.
  const days = plan.days ?? [];

  return (
    <>
      <PageHeader
        title={plan.name}
        subtitle={[plan.memberName, plan.goal].filter(Boolean).join(' · ')}
        crumbs={
          backHref
            ? [{ label: t('title'), href: backHref }, { label: plan.name }]
            : undefined
        }
        status={
          <StatusChip
            label={t(`status.${plan.status}`)}
            tone={plan.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
        }
        actions={
          readOnly ? undefined : (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                onClick={() => setEditingPlan(true)}
              >
                {tc('actions.edit')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color={archived ? 'primary' : 'error'}
                startIcon={archived ? <RestoreIcon sx={{ fontSize: 16 }} /> : <ArchiveIcon sx={{ fontSize: 16 }} />}
                onClick={() => setArchiving(true)}
              >
                {archived ? tc('actions.reactivate') : tc('actions.archive')}
              </Button>
            </>
          )
        }
      />

      <Stack spacing={2}>
        {plan.description || plan.trainerNotes ? (
          <Card>
            <CardContent>
              {plan.description ? <Typography variant="body2">{plan.description}</Typography> : null}
              {plan.trainerNotes ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: plan.description ? 1 : 0 }}>
                  {plan.trainerNotes}
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" variant="outlined" label={t('dayCount', { count: plan.dayCount })} />
          <Chip size="small" variant="outlined" label={t('exerciseCount', { count: plan.exerciseCount })} />
        </Stack>

        {days.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                title={t('days.empty')}
                body={editable ? t('days.emptyHint') : undefined}
                action={
                  editable ? (
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAddingDay(true)}>
                      {t('days.add')}
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence initial={false}>
            {days.map((day) => (
              <Box
                key={day.id}
                component={m.div}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              >
                <Card>
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                      sx={{ mb: 1.5 }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary" className="tabular">
                          {day.dayOrder}
                        </Typography>
                        <Typography variant="h4" noWrap>
                          {day.name}
                        </Typography>
                      </Stack>
                      {editable ? (
                        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                          <Tooltip title={t('exercises.add')}>
                            <IconButton size="small" onClick={() => setAddingExerciseTo(day)} aria-label={t('exercises.add')}>
                              <AddIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('days.edit')}>
                            <IconButton size="small" onClick={() => setEditingDay(day)} aria-label={t('days.edit')}>
                              <EditIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('days.delete.confirm')}>
                            <IconButton size="small" onClick={() => setDeletingDay(day)} aria-label={t('days.delete.confirm')}>
                              <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ) : null}
                    </Stack>

                    {day.notes ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {day.notes}
                      </Typography>
                    ) : null}

                    <Divider sx={{ mb: 1 }} />

                    {day.exercises.length === 0 ? (
                      <EmptyState
                        title={t('exercises.empty')}
                        body={editable ? t('exercises.emptyHint') : undefined}
                        compact
                      />
                    ) : (
                      <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {day.exercises.map((exercise) => (
                          <Box
                            component="li"
                            key={exercise.id}
                            sx={{
                              py: 1,
                              '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                            }}
                          >
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 540 }} noWrap>
                                  {exercise.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap display="block">
                                  {exercise.weight
                                    ? t('exercises.summaryWithWeight', {
                                        sets: exercise.sets,
                                        reps: exercise.reps,
                                        weight: `${exercise.weight} ${exercise.weightUnit === 'LB' ? 'lb' : 'kg'}`,
                                      })
                                    : t('exercises.summary', { sets: exercise.sets, reps: exercise.reps })}
                                  {exercise.restSeconds
                                    ? ` · ${t('exercises.restSecondsUnit', { count: exercise.restSeconds })}`
                                    : ''}
                                  {exercise.targetMuscleGroup ? ` · ${exercise.targetMuscleGroup}` : ''}
                                </Typography>
                                {exercise.notes ? (
                                  <Typography variant="caption" color="text.disabled" display="block">
                                    {exercise.notes}
                                  </Typography>
                                ) : null}
                              </Box>
                              {editable ? (
                                <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                                  <IconButton
                                    size="small"
                                    onClick={() => setEditingExercise({ day, exercise })}
                                    aria-label={t('exercises.edit')}
                                  >
                                    <EditIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() => setDeletingExercise({ day, exercise })}
                                    aria-label={t('exercises.delete.confirm')}
                                  >
                                    <DeleteIcon sx={{ fontSize: 17 }} />
                                  </IconButton>
                                </Stack>
                              ) : null}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Box>
            ))}
          </AnimatePresence>
        )}

        {editable && days.length > 0 ? (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setAddingDay(true)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('days.add')}
          </Button>
        ) : null}
      </Stack>

      <PlanDialog open={editingPlan} plan={plan} onClose={() => setEditingPlan(false)} />
      <DayDialog
        open={addingDay || Boolean(editingDay)}
        planId={planId}
        day={editingDay ?? undefined}
        nextOrder={days.length + 1}
        onClose={() => {
          setAddingDay(false);
          setEditingDay(null);
        }}
      />
      <ExerciseDialog
        open={Boolean(addingExerciseTo) || Boolean(editingExercise)}
        planId={planId}
        dayId={(addingExerciseTo ?? editingExercise?.day)?.id ?? ''}
        exercise={editingExercise?.exercise}
        nextOrder={((addingExerciseTo ?? editingExercise?.day)?.exercises.length ?? 0) + 1}
        onClose={() => {
          setAddingExerciseTo(null);
          setEditingExercise(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingDay)}
        title={t('days.delete.title')}
        body={deletingDay ? t('days.delete.body', { name: deletingDay.name }) : ''}
        confirmLabel={t('days.delete.confirm')}
        tone="danger"
        busy={deleteDay.isPending}
        onCancel={() => setDeletingDay(null)}
        onConfirm={async () => {
          if (!deletingDay) return;
          try {
            await deleteDay.mutateAsync(deletingDay.id);
            toast.success(t('days.delete.success'));
            setDeletingDay(null);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingExercise)}
        title={t('exercises.delete.title')}
        body={deletingExercise ? t('exercises.delete.body', { name: deletingExercise.exercise.name }) : ''}
        confirmLabel={t('exercises.delete.confirm')}
        tone="danger"
        busy={deleteExercise.isPending}
        onCancel={() => setDeletingExercise(null)}
        onConfirm={async () => {
          if (!deletingExercise) return;
          try {
            await deleteExercise.mutateAsync(deletingExercise.exercise.id);
            toast.success(t('exercises.delete.success'));
            setDeletingExercise(null);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />

      <ConfirmDialog
        open={archiving}
        title={archived ? t('reactivate.title') : t('archive.title')}
        body={archived ? t('reactivate.body', { name: plan.name }) : t('archive.body', { name: plan.name })}
        confirmLabel={archived ? t('reactivate.confirm') : t('archive.confirm')}
        tone={archived ? 'default' : 'danger'}
        busy={archive.isPending}
        onCancel={() => setArchiving(false)}
        onConfirm={async () => {
          try {
            await archive.mutateAsync(!archived);
            toast.success(archived ? t('reactivate.success') : t('archive.success'));
            setArchiving(false);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />
    </>
  );
}
