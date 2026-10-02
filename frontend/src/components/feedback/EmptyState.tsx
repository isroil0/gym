'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InboxIcon from '@mui/icons-material/InboxOutlined';
import SearchOffIcon from '@mui/icons-material/SearchOffOutlined';
import type { SvgIconProps } from '@mui/material/SvgIcon';

/**
 * Nothing to show. Distinguishes "there is nothing yet" from "your filters
 * excluded everything", because the useful next step differs: create one, or
 * widen the search.
 */
export function EmptyState({
  title,
  body,
  icon: Icon,
  variant = 'empty',
  action,
  compact = false,
}: {
  title: string;
  body?: string;
  icon?: React.ComponentType<SvgIconProps>;
  variant?: 'empty' | 'filtered';
  action?: React.ReactNode;
  compact?: boolean;
}) {
  const Fallback = variant === 'filtered' ? SearchOffIcon : InboxIcon;
  const Glyph = Icon ?? Fallback;

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ textAlign: 'center', py: compact ? 4 : 8, px: 3 }}
      role="status"
    >
      <Box
        aria-hidden
        sx={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          borderRadius: 2.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.sunken',
          color: 'text.disabled',
        }}
      >
        <Glyph sx={{ fontSize: compact ? 20 : 26 }} />
      </Box>
      <Box>
        <Typography variant={compact ? 'subtitle2' : 'h4'} sx={{ mb: body ? 0.5 : 0 }}>
          {title}
        </Typography>
        {body ? (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: 'auto' }}>
            {body}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box sx={{ pt: 0.5 }}>{action}</Box> : null}
    </Stack>
  );
}

/** A failed request, with the one action that might fix it. */
export function ErrorState({
  title,
  body,
  detail,
  onRetry,
  retryLabel,
  compact = false,
}: {
  title: string;
  body?: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel: string;
  compact?: boolean;
}) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ textAlign: 'center', py: compact ? 4 : 8, px: 3 }}
      role="alert"
    >
      <Box
        aria-hidden
        sx={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          borderRadius: 2.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(248,113,113,0.12)' : 'rgba(220,38,38,0.08)',
          color: 'error.main',
          fontSize: compact ? 20 : 26,
        }}
      >
        !
      </Box>
      <Box>
        <Typography variant={compact ? 'subtitle2' : 'h4'} sx={{ mb: body ? 0.5 : 0 }}>
          {title}
        </Typography>
        {body ? (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            {body}
          </Typography>
        ) : null}
        {detail ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', mt: 0.5, fontFamily: 'var(--mono, monospace)' }}
          >
            {detail}
          </Typography>
        ) : null}
      </Box>
      {onRetry ? (
        <Button onClick={onRetry} variant="outlined" size="small">
          {retryLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
