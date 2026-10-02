'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import TextField from '@mui/material/TextField';
import { FormDialog } from '@/components/forms/FormDialog';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { useVoidEntry } from './useAccounting';
import type { AccountingEntry } from '@/lib/api/types';

/** Remove a manual entry from the totals, with a reason on the record. */
export function VoidEntryDialog({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: AccountingEntry;
  onClose: () => void;
}) {
  const t = useTranslations('accounting.entries.void');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const describe = useApiErrorMessage();
  const voidEntry = useVoidEntry(entry.id);

  return (
    <FormDialog
      open={open}
      title={t('title')}
      description={t('body')}
      submitLabel={t('confirm')}
      onClose={onClose}
      submitting={voidEntry.isPending}
      disabled={reason.trim().length === 0}
      error={error}
      destructive
      maxWidth="xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await voidEntry.mutateAsync({ reason: reason.trim() });
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
        required
        autoFocus
        multiline
        rows={2}
        fullWidth
      />
    </FormDialog>
  );
}
