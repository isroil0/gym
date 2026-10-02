'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { FormDialog } from '@/components/forms/FormDialog';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import {
  useAddDay,
  useAddExercise,
  useCreateWorkoutPlan,
  useUpdateDay,
  useUpdateExercise,
  useUpdateWorkoutPlan,
} from './useWorkouts';
import type { Member, Schemas, WorkoutPlan } from '@/lib/api/types';

type Day = Schemas['WorkoutDayResponseDto'];
type Exercise = Schemas['WorkoutExerciseResponseDto'];

/** Create or edit the plan itself. The member is fixed once it exists. */
export function PlanDialog({
  open,
  plan,
  member,
  onClose,
  onCreated,
}: {
  open: boolean;
  plan?: WorkoutPlan;
  member?: Member;
  onClose: () => void;
  onCreated?: (plan: WorkoutPlan) => void;
}) {
  const t = useTranslations('workouts');
  const tf = useTranslations('workouts.fields');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const editing = Boolean(plan);

  const [chosen, setChosen] = useState<Member | null>(member ?? null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateWorkoutPlan();
  const update = useUpdateWorkoutPlan(plan?.id ?? '');
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    setChosen(member ?? null);
    setName(plan?.name ?? '');
    setGoal(plan?.goal ?? '');
    setDescription(plan?.description ?? '');
    setError(null);
  }, [open, plan, member]);

  const valid = name.trim().length > 0 && (editing || Boolean(chosen));

  return (
    <FormDialog
      open={open}
      title={editing ? t('edit') : t('createTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('create')}
      onClose={onClose}
      submitting={mutation.isPending}
      disabled={!valid}
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const body: Record<string, unknown> = { name: name.trim() };
        if (!editing && chosen) body.memberId = chosen.id;
        if (goal.trim()) body.goal = goal.trim();
        if (description.trim()) body.description = description.trim();
        try {
          const saved = await mutation.mutateAsync(body);
          toast.success(editing ? t('updated') : t('created'));
          if (!editing) onCreated?.(saved);
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      {!editing && !member ? (
        <MemberPicker value={chosen} onChange={setChosen} label={tf('member')} required autoFocus />
      ) : null}
      <TextField
        size="small"
        label={tf('name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus={editing || Boolean(member)}
        fullWidth
      />
      <TextField
        size="small"
        label={tf('goal')}
        placeholder={tf('goalPlaceholder')}
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        fullWidth
      />
      <TextField
        size="small"
        label={tf('notes')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        multiline
        rows={3}
        fullWidth
      />
    </FormDialog>
  );
}

/** Add or rename a training day. */
export function DayDialog({
  open,
  planId,
  day,
  nextOrder,
  onClose,
}: {
  open: boolean;
  planId: string;
  day?: Day;
  nextOrder: number;
  onClose: () => void;
}) {
  const t = useTranslations('workouts.days');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const editing = Boolean(day);

  const [name, setName] = useState('');
  const [order, setOrder] = useState('1');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useAddDay(planId);
  const update = useUpdateDay(planId, day?.id ?? '');
  const mutation = editing ? update : add;

  useEffect(() => {
    if (!open) return;
    setName(day?.name ?? '');
    setOrder(String(day?.dayOrder ?? nextOrder));
    setNotes(day?.notes ?? '');
    setError(null);
  }, [open, day, nextOrder]);

  return (
    <FormDialog
      open={open}
      title={editing ? t('edit') : t('addTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('add')}
      onClose={onClose}
      submitting={mutation.isPending}
      disabled={name.trim().length === 0}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await mutation.mutateAsync({
            name: name.trim(),
            dayOrder: Number(order) || nextOrder,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          });
          toast.success(editing ? t('updated') : t('created'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('name')}
        placeholder={t('namePlaceholder')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus
        fullWidth
      />
      <TextField
        size="small"
        type="number"
        label={t('order')}
        value={order}
        onChange={(event) => setOrder(event.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 31, className: 'tabular' } }}
        fullWidth
      />
      <TextField
        size="small"
        label={t('notes')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        rows={2}
        fullWidth
      />
    </FormDialog>
  );
}

/** Add or edit one exercise within a day. */
export function ExerciseDialog({
  open,
  planId,
  dayId,
  exercise,
  nextOrder,
  onClose,
}: {
  open: boolean;
  planId: string;
  dayId: string;
  exercise?: Exercise;
  nextOrder: number;
  onClose: () => void;
}) {
  const t = useTranslations('workouts.exercises');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const editing = Boolean(exercise);

  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'KG' | 'LB'>('KG');
  const [rest, setRest] = useState('90');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useAddExercise(planId, dayId);
  const update = useUpdateExercise(planId, dayId, exercise?.id ?? '');
  const mutation = editing ? update : add;

  useEffect(() => {
    if (!open) return;
    setName(exercise?.name ?? '');
    setSets(String(exercise?.sets ?? 3));
    setReps(exercise?.reps ?? '10');
    setWeight(exercise?.weight != null ? String(exercise.weight) : '');
    setUnit((exercise?.weightUnit as 'KG' | 'LB') ?? 'KG');
    setRest(exercise?.restSeconds != null ? String(exercise.restSeconds) : '90');
    setNotes(exercise?.notes ?? '');
    setError(null);
  }, [open, exercise]);

  const setsNumber = Number(sets);
  const valid = name.trim().length > 0 && reps.trim().length > 0 && setsNumber >= 1;

  return (
    <FormDialog
      open={open}
      title={editing ? t('edit') : t('addTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('add')}
      onClose={onClose}
      submitting={mutation.isPending}
      disabled={!valid}
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const body: Record<string, unknown> = {
          name: name.trim(),
          sets: setsNumber,
          reps: reps.trim(),
          exerciseOrder: exercise?.exerciseOrder ?? nextOrder,
        };
        if (weight.trim()) {
          body.weight = Number(weight);
          body.weightUnit = unit;
        }
        if (rest.trim()) body.restSeconds = Number(rest);
        if (notes.trim()) body.notes = notes.trim();
        try {
          await mutation.mutateAsync(body);
          toast.success(editing ? t('updated') : t('created'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('name')}
        placeholder={t('namePlaceholder')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus
        fullWidth
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' } }}>
        <TextField
          size="small"
          type="number"
          label={t('sets')}
          value={sets}
          onChange={(event) => setSets(event.target.value)}
          slotProps={{ htmlInput: { min: 1, max: 20, className: 'tabular' } }}
          required
        />
        <TextField
          size="small"
          label={t('reps')}
          placeholder={t('repsPlaceholder')}
          value={reps}
          onChange={(event) => setReps(event.target.value)}
          required
        />
        <TextField
          size="small"
          type="number"
          label={t('restSeconds')}
          value={rest}
          onChange={(event) => setRest(event.target.value)}
          slotProps={{ htmlInput: { min: 0, max: 600, step: 15, className: 'tabular' } }}
        />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '2fr 1fr' }}>
        <TextField
          size="small"
          type="number"
          label={t('weight')}
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          slotProps={{ htmlInput: { min: 0, step: 0.5, className: 'tabular' } }}
        />
        <TextField
          select
          size="small"
          label={t('weight')}
          value={unit}
          onChange={(event) => setUnit(event.target.value as 'KG' | 'LB')}
        >
          <MenuItem value="KG">kg</MenuItem>
          <MenuItem value="LB">lb</MenuItem>
        </TextField>
      </Box>
      <TextField
        size="small"
        label={t('instructions')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        rows={2}
        fullWidth
      />
    </FormDialog>
  );
}
