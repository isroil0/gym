'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * The last line of defence. A render that threw leaves the reader with an
 * explanation and a way out, never a blank page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.boundary');

  useEffect(() => {
    // Surfaced in the browser console and in server logs via the digest, so
    // a support call has something to quote.
    console.error('Unhandled rendering error', error);
  }, [error]);

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', p: 3 }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', maxWidth: 460 }}>
        <Typography variant="h2">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('body')}
        </Typography>
        {error.digest ? (
          <Typography variant="caption" color="text.disabled">
            {error.digest}
          </Typography>
        ) : null}
        <Button variant="contained" onClick={reset}>
          {t('reload')}
        </Button>
      </Stack>
    </Box>
  );
}
