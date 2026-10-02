'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Slide, { type SlideProps } from '@mui/material/Slide';
import { useMediaQuery, useTheme } from '@mui/material';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Shown under the message — usually a backend reason or a reference id. */
  detail?: string;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

function SlideUp(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // One at a time, queued. Stacked toasts cover the thing the reader is
  // looking at and nobody reads the third one.
  const [queue, setQueue] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'info', detail?: string) => {
    setQueue((current) => [...current, { id: nextId++, message, tone, detail }]);
  }, []);

  const dismiss = useCallback(() => setQueue((current) => current.slice(1)), []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, detail) => show(message, 'success', detail),
      error: (message, detail) => show(message, 'error', detail),
      warning: (message, detail) => show(message, 'warning', detail),
      info: (message, detail) => show(message, 'info', detail),
    }),
    [show],
  );

  const current = queue[0];

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id}
        open={Boolean(current)}
        // Errors stay until dismissed; a success message that vanished before
        // it was read has done its job anyway.
        autoHideDuration={current?.tone === 'error' ? null : 4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') dismiss();
        }}
        anchorOrigin={{
          vertical: isMobile ? 'top' : 'bottom',
          horizontal: isMobile ? 'center' : 'left',
        }}
        slots={{ transition: SlideUp }}
        sx={{ maxWidth: { xs: 'calc(100vw - 24px)', sm: 460 } }}
      >
        <Alert
          onClose={dismiss}
          severity={current?.tone ?? 'info'}
          variant="filled"
          sx={{ width: '100%', boxShadow: (t) => t.elevation.lg, alignItems: 'flex-start' }}
        >
          <span>{current?.message}</span>
          {current?.detail ? (
            <span style={{ display: 'block', opacity: 0.85, fontSize: '0.8125rem', marginTop: 2 }}>
              {current.detail}
            </span>
          ) : null}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
