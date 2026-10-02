'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { FormDialog } from '@/components/forms/FormDialog';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { useAssignTrainer } from './useMembers';
import type { Member, Paginated, Trainer } from '@/lib/api/types';

/** Assign, change or remove the trainer responsible for a member. */
export function AssignTrainerDialog({
  open,
  member,
  onClose,
}: {
  open: boolean;
  member: Member;
  onClose: () => void;
}) {
  const t = useTranslations('members.assignTrainer');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const [trainerId, setTrainerId] = useState(member.assignedTrainer?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useAssignTrainer(member.id);

  const trainers = useQuery({
    queryKey: keys.trainers.list({ limit: 100, status: 'ACTIVE' }),
    queryFn: () =>
      api.get<Paginated<Trainer>>('trainers', { query: { limit: 100, status: 'ACTIVE' } }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (open) {
      setTrainerId(member.assignedTrainer?.id ?? '');
      setError(null);
    }
  }, [open, member.assignedTrainer?.id]);

  const name = `${member.account.firstName} ${member.account.lastName}`;

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body', { name })}
      submitLabel={ta('save')}
      onClose={onClose}
      submitting={mutation.isPending}
      error={error}
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await mutation.mutateAsync(trainerId === '' ? null : trainerId);
          toast.success(trainerId === '' ? t('removed') : t('success'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        select
        fullWidth
        size="small"
        label={t('field')}
        value={trainerId}
        onChange={(event) => setTrainerId(event.target.value)}
        disabled={trainers.isPending}
      >
        <MenuItem value="">
          <em>{t('none')}</em>
        </MenuItem>
        {(trainers.data?.data ?? []).map((trainer) => (
          <MenuItem key={trainer.id} value={trainer.id}>
            <span>
              {trainer.account.firstName} {trainer.account.lastName}
              {trainer.specialization ? (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {trainer.specialization}
                </Typography>
              ) : null}
            </span>
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
