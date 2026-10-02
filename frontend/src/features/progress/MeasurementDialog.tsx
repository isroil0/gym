'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FormDialog } from '@/components/forms/FormDialog';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { ApiError } from '@/lib/api/errors';
import { toIsoDate } from '@/lib/format/datetime';
import { useCreateMeasurement, useUpdateMeasurement } from './useProgress';
import { PROGRESS_METRICS, type Measurement, type Member, type ProgressMetric } from '@/lib/api/types';

const UNITS: Record<ProgressMetric, string> = {
  weightKg: 'kg',
  heightCm: 'cm',
  bodyFatPercent: '%',
  muscleMassKg: 'kg',
  chestCm: 'cm',
  waistCm: 'cm',
  hipsCm: 'cm',
  thighCm: 'cm',
  armCm: 'cm',
  restingHeartRate: 'bpm',
};

/**
 * Record a set of measurements.
 *
 * Every metric is optional — a trainer who only weighed somebody should not
 * have to invent a thigh circumference. Blank fields are left out of the
 * request entirely rather than sent as nulls.
 */
export function MeasurementDialog({
  open,
  member,
  measurement,
  onClose,
}: {
  open: boolean;
  member?: Member;
  measurement?: Measurement;
  onClose: () => void;
}) {
  const t = useTranslations('progress');
  const tf = useTranslations('progress.fields');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const editing = Boolean(measurement);

  const [chosen, setChosen] = useState<Member | null>(member ?? null);
  const [measuredOn, setMeasuredOn] = useState(toIsoDate(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const create = useCreateMeasurement();
  const update = useUpdateMeasurement(measurement?.id ?? '');
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    setChosen(member ?? null);
    setMeasuredOn(measurement?.measuredOn?.slice(0, 10) ?? toIsoDate(new Date()));
    setValues(
      Object.fromEntries(
        PROGRESS_METRICS.map((metric) => [
          metric,
          measurement?.[metric] != null ? String(measurement[metric]) : '',
        ]),
      ),
    );
    setNotes(measurement?.notes ?? '');
    setError(null);
    setDateError(null);
  }, [open, member, measurement]);

  const filled = PROGRESS_METRICS.filter((metric) => values[metric]?.trim());
  const valid = (editing || Boolean(chosen)) && Boolean(measuredOn) && filled.length > 0;

  return (
    <FormDialog
      open={open}
      title={editing ? t('edit') : t('recordTitle')}
      submitLabel={editing ? ta('saveChanges') : ta('save')}
      onClose={onClose}
      submitting={mutation.isPending}
      disabled={!valid}
      error={error}
      maxWidth="md"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const body: Record<string, unknown> = { measuredOn };
        if (!editing && chosen) body.memberId = chosen.id;
        for (const metric of PROGRESS_METRICS) {
          const raw = values[metric]?.trim();
          if (raw) body[metric] = Number(raw);
        }
        if (notes.trim()) body.notes = notes.trim();
        try {
          await mutation.mutateAsync(body);
          toast.success(editing ? t('updated') : t('created'));
          onClose();
        } catch (cause) {
          // The backend keeps one measurement set per member per day. That
          // is worth saying on the date field rather than as a generic
          // "already in use" at the top of the dialog.
          if (cause instanceof ApiError && cause.status === 409) {
            setDateError(t('duplicateDate'));
            return;
          }
          setError(describe(cause));
        }
      }}
    >
      {!editing && !member ? (
        <MemberPicker value={chosen} onChange={setChosen} label={tf('member')} required autoFocus />
      ) : null}

      <TextField
        size="small"
        type="date"
        label={tf('measuredOn')}
        value={measuredOn}
        onChange={(event) => {
          setMeasuredOn(event.target.value);
          setDateError(null);
        }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: toIsoDate(new Date()) } }}
        error={Boolean(dateError)}
        helperText={dateError ?? undefined}
        required
        sx={{ maxWidth: dateError ? 420 : 220 }}
      />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {PROGRESS_METRICS.map((metric) => (
          <TextField
            key={metric}
            size="small"
            type="number"
            label={t(`metrics.${metric}`)}
            value={values[metric] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [metric]: event.target.value }))}
            slotProps={{
              htmlInput: { min: 0, step: 0.1, className: 'tabular' },
              input: { endAdornment: <Typography variant="caption" color="text.secondary">{UNITS[metric]}</Typography> },
            }}
          />
        ))}
      </Box>

      <TextField
        size="small"
        label={tf('notes')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        rows={2}
        fullWidth
      />
    </FormDialog>
  );
}
