'use client';

import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/CloseRounded';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * A form in a dialog — on a phone, a full-screen sheet instead.
 *
 * Submission is wired to a real `<form>` so Enter submits and the browser's
 * own validation and autofill behave. Closing is blocked while a write is in
 * flight: a half-finished payment is not something to lose to a stray click.
 */
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  cancelLabel,
  onClose,
  onSubmit,
  submitting = false,
  disabled = false,
  error,
  maxWidth = 'sm',
  destructive = false,
  children,
  extraActions,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  cancelLabel?: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  submitting?: boolean;
  disabled?: boolean;
  error?: string | null;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  destructive?: boolean;
  children: React.ReactNode;
  extraActions?: React.ReactNode;
}) {
  const t = useTranslations('common.actions');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
      fullScreen={fullScreen}
      aria-labelledby="form-dialog-title"
    >
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle id="form-dialog-title" sx={{ pr: 7 }}>
          {title}
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
              {description}
            </Typography>
          ) : null}
          <IconButton
            onClick={onClose}
            disabled={submitting}
            aria-label={t('close')}
            size="small"
            sx={{ position: 'absolute', right: 14, top: 16 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            ) : null}
            {children}
          </Stack>
        </DialogContent>

        <DialogActions>
          {extraActions}
          <Button onClick={onClose} disabled={submitting} color="inherit">
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={destructive ? 'error' : 'primary'}
            disabled={submitting || disabled}
            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
