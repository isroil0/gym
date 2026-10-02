'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { FormDialog } from '@/components/forms/FormDialog';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime } from '@/lib/format/datetime';
import {
  useCancelSession,
  useCompleteSession,
  useCreateSession,
  useNoShowSession,
  useRescheduleSession,
} from './useSessions';
import type { Member, TrainingSession } from '@/lib/api/types';

/** The value a datetime-local input wants, in the browser's own clock. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Book a session, or move one. */
export function SessionDialog({
  open,
  session,
  trainerId,
  onClose,
}: {
  open: boolean;
  session?: TrainingSession;
  trainerId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('sessions');
  const tf = useTranslations('sessions.fields');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const editing = Boolean(session);

  const [member, setMember] = useState<Member | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateSession();
  const reschedule = useRescheduleSession(session?.id ?? '');
  const mutation = editing ? reschedule : create;

  useEffect(() => {
    if (!open) return;
    const start = session ? new Date(session.startsAt) : nextHour();
    const end = session ? new Date(session.endsAt) : new Date(start.getTime() + 3_600_000);
    setMember(null);
    setStartsAt(toLocalInput(start));
    setEndsAt(toLocalInput(end));
    setLocation(session?.location ?? '');
    setError(null);
  }, [open, session]);

  // Moving the start keeps the length the same, which is what rescheduling
  // almost always means.
  const onStartChange = (value: string) => {
    const previousStart = Date.parse(startsAt);
    const previousEnd = Date.parse(endsAt);
    setStartsAt(value);
    if (Number.isFinite(previousStart) && Number.isFinite(previousEnd)) {
      const duration = previousEnd - previousStart;
      const next = Date.parse(value);
      if (Number.isFinite(next)) setEndsAt(toLocalInput(new Date(next + duration)));
    }
  };

  const ordered = Boolean(startsAt && endsAt && Date.parse(endsAt) > Date.parse(startsAt));
  const valid = ordered && (editing || Boolean(member));

  return (
    <FormDialog
      open={open}
      title={editing ? t('rescheduleTitle') : t('createTitle')}
      submitLabel={editing ? t('reschedule') : ta('create')}
      onClose={onClose}
      submitting={mutation.isPending}
      disabled={!valid}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const body: Record<string, unknown> = {
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        };
        if (!editing && member) body.memberId = member.id;
        if (!editing && trainerId) body.trainerId = trainerId;
        if (location.trim()) body.location = location.trim();
        try {
          await mutation.mutateAsync(body);
          toast.success(editing ? t('updated') : t('created'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      {!editing ? (
        <MemberPicker value={member} onChange={setMember} label={tf('member')} required autoFocus />
      ) : null}

      <Box sx={{ display: 'grid', gap: 2 }}>
        <TextField
          size="small"
          type="datetime-local"
          label={tf('startsAt')}
          value={startsAt}
          onChange={(event) => onStartChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          size="small"
          type="datetime-local"
          label={tf('endsAt')}
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          error={Boolean(startsAt && endsAt) && !ordered}
          helperText={Boolean(startsAt && endsAt) && !ordered ? t('fields.endsAt') : undefined}
          fullWidth
        />
      </Box>

      <TextField
        size="small"
        label={tf('notes')}
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        fullWidth
      />
    </FormDialog>
  );
}

/** Mark a session completed, with optional notes. */
export function CompleteSessionDialog({
  open,
  session,
  onClose,
}: {
  open: boolean;
  session: TrainingSession;
  onClose: () => void;
}) {
  const t = useTranslations('sessions.complete');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const complete = useCompleteSession(session.id);

  useEffect(() => {
    if (open) {
      setNotes(session.trainerNotes ?? '');
      setError(null);
    }
  }, [open, session.trainerNotes]);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body', { name: session.memberName ?? '' })}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={complete.isPending}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await complete.mutateAsync(notes.trim() ? { trainerNotes: notes.trim() } : {});
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('notes')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        multiline
        rows={3}
        autoFocus
        fullWidth
      />
    </FormDialog>
  );
}

/** Cancel a session, with a reason. */
export function CancelSessionDialog({
  open,
  session,
  onClose,
}: {
  open: boolean;
  session: TrainingSession;
  onClose: () => void;
}) {
  const t = useTranslations('sessions.cancelSession');
  const { locale } = useLocale();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const cancel = useCancelSession(session.id);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body', {
        name: session.memberName ?? '',
        date: formatDateTime(session.startsAt, locale),
      })}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={cancel.isPending}
      error={error}
      destructive
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await cancel.mutateAsync(reason.trim() ? { reason: reason.trim() } : {});
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        multiline
        rows={2}
        autoFocus
        fullWidth
      />
    </FormDialog>
  );
}

/** Record that the member did not turn up. */
export function NoShowDialog({
  open,
  session,
  onClose,
}: {
  open: boolean;
  session: TrainingSession;
  onClose: () => void;
}) {
  const t = useTranslations('sessions.noShow');
  const { locale } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const noShow = useNoShowSession(session.id);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body', {
        name: session.memberName ?? '',
        date: formatDateTime(session.startsAt, locale),
      })}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={noShow.isPending}
      error={error}
      destructive
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await noShow.mutateAsync(undefined as never);
          toast.success(t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <Alert severity="warning" variant="outlined">
        {t('body', { name: session.memberName ?? '', date: formatDateTime(session.startsAt, locale) })}
      </Alert>
    </FormDialog>
  );
}

function nextHour(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}
