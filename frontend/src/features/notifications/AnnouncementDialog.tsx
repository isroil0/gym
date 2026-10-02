'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { FormDialog } from '@/components/forms/FormDialog';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { NOTIFICATION_SEVERITIES } from '@/lib/api/types';

const AUDIENCES = ['ALL', 'MEMBERS', 'TRAINERS'] as const;

/** Send one message to everybody in a chosen audience. */
export function AnnouncementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('notifications.announcement');
  const tn = useTranslations('notifications');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>('ALL');
  const [severity, setSeverity] = useState('INFO');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ delivered?: number; count?: number }>('notifications/announcements', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications.all }),
  });

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setMessage('');
    setAudience('ALL');
    setSeverity('INFO');
    setError(null);
  }, [open]);

  const valid = title.trim().length > 0 && message.trim().length > 0;

  return (
    <FormDialog
      open={open}
      title={t('createTitle')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={send.isPending}
      disabled={!valid}
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          const result = await send.mutateAsync({
            title: title.trim(),
            message: message.trim(),
            audience,
            severity,
          });
          toast.success(t('success', { count: result?.delivered ?? result?.count ?? 0 }));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('fields.title')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        autoFocus
        fullWidth
      />
      <TextField
        size="small"
        label={t('fields.message')}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        required
        multiline
        rows={4}
        fullWidth
      />
      <TextField
        select
        size="small"
        label={t('fields.audience')}
        value={audience}
        onChange={(event) => setAudience(event.target.value as (typeof AUDIENCES)[number])}
        fullWidth
      >
        {AUDIENCES.map((option) => (
          <MenuItem key={option} value={option}>
            {t(`audience.${option}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t('fields.severity')}
        value={severity}
        onChange={(event) => setSeverity(event.target.value)}
        fullWidth
      >
        {NOTIFICATION_SEVERITIES.map((option) => (
          <MenuItem key={option} value={option}>
            {tn(`severity.${option}`)}
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
