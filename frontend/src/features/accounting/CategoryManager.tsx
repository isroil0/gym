'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/AddRounded';
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormDialog } from '@/components/forms/FormDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import {
  useArchiveCategory,
  useCreateCategory,
  useExpenseCategories,
  useUpdateCategory,
} from './useAccounting';
import type { ExpenseCategory } from '@/lib/api/types';

/** The categories expenses are filed under. */
export function CategoryManager() {
  const t = useTranslations('accounting.categories');
  const tc = useTranslations('common');
  const toast = useToast();
  const describe = useApiErrorMessage();

  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<ExpenseCategory | null>(null);

  // Archived ones are shown too, so a category can be brought back.
  const { data, isPending } = useExpenseCategories(true);
  const archive = useArchiveCategory(archiving?.id ?? '');

  const archived = archiving?.archived === true;

  return (
    <SectionCard
      title={t('title')}
      divided
      action={
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setCreating(true)}>
          {t('create')}
        </Button>
      }
    >
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : (data?.data.length ?? 0) === 0 ? (
        <EmptyState title={t('empty')} compact />
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {data!.data.map((category) => (
            <Chip
              key={category.id}
              label={
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <span>{category.name}</span>
                  <Tooltip title={category.archived ? tc('actions.reactivate') : tc('actions.archive')}>
                    <IconButton
                      size="small"
                      sx={{ p: 0.25, ml: 0.25 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setArchiving(category);
                      }}
                      aria-label={category.archived ? tc('actions.reactivate') : tc('actions.archive')}
                    >
                      {category.archived ? (
                        <RestoreIcon sx={{ fontSize: 14 }} />
                      ) : (
                        <ArchiveIcon sx={{ fontSize: 14 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
              variant="outlined"
              onClick={() => setEditing(category)}
              sx={{ opacity: category.archived ? 0.55 : 1, height: 28 }}
            />
          ))}
        </Box>
      )}

      <CategoryDialog open={creating} onClose={() => setCreating(false)} />
      <CategoryDialog
        open={Boolean(editing)}
        category={editing ?? undefined}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archived ? t('reactivate.title') : t('archive.title')}
        body={
          archiving
            ? archived
              ? t('reactivate.body', { name: archiving.name })
              : t('archive.body', { name: archiving.name })
            : ''
        }
        confirmLabel={archived ? t('reactivate.confirm') : t('archive.confirm')}
        tone={archived ? 'default' : 'danger'}
        busy={archive.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={async () => {
          try {
            await archive.mutateAsync(!archived);
            toast.success(archived ? t('reactivate.success') : t('archive.success'));
            setArchiving(null);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />
    </SectionCard>
  );
}

function CategoryDialog({
  open,
  category,
  onClose,
}: {
  open: boolean;
  category?: ExpenseCategory;
  onClose: () => void;
}) {
  const t = useTranslations('accounting.categories');
  const ta = useTranslations('common.actions');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateCategory();
  const update = useUpdateCategory(category?.id ?? '');
  const mutation = category ? update : create;

  // Reset whenever the dialog opens on a different record.
  const key = `${open}-${category?.id ?? 'new'}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setError(null);
  }

  return (
    <FormDialog
      open={open}
      title={category ? t('edit') : t('createTitle')}
      submitLabel={category ? ta('saveChanges') : ta('create')}
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
            ...(description.trim() ? { description: description.trim() } : {}),
          });
          toast.success(category ? t('updated') : t('created'));
          onClose();
        } catch (cause) {
          setError(describe(cause));
        }
      }}
    >
      <TextField
        size="small"
        label={t('fields.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus
        fullWidth
      />
      <TextField
        size="small"
        label={t('fields.description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        fullWidth
      />
    </FormDialog>
  );
}
