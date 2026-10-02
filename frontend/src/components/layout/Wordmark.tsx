'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

/** The product mark: a simple glyph plus the name, or just the glyph when tight. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('common');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.5,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '-0.03em',
        }}
      >
        G
      </Box>
      {!compact ? (
        <Typography
          variant="h5"
          component="span"
          noWrap
          sx={{ fontWeight: 640, letterSpacing: '-0.015em' }}
        >
          {t('appName')}
        </Typography>
      ) : null}
    </Box>
  );
}
