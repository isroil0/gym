'use client';

import Chip, { type ChipProps } from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import type { StatusTone } from '@/theme/tokens';

/**
 * A status as a quiet, filled chip with a leading dot.
 *
 * The dot does the work at a glance in a dense table; the word is there for
 * anyone who has not memorised the colours, and for screen readers, for whom
 * colour conveys nothing at all.
 */
export function StatusChip({
  label,
  tone = 'neutral',
  size = 'small',
  dot = true,
  ...props
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
} & Omit<ChipProps, 'label' | 'color' | 'variant'>) {
  const theme = useTheme();
  const color = toneColor(theme, tone);

  return (
    <Chip
      size={size}
      label={label}
      icon={
        dot ? (
          <Box
            aria-hidden
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: color,
              ml: '8px !important',
              mr: '-2px !important',
              flexShrink: 0,
            }}
          />
        ) : undefined
      }
      sx={{
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.16 : 0.1),
        color: theme.palette.mode === 'dark' ? alpha(color, 0.95) : color,
        border: '1px solid',
        borderColor: alpha(color, theme.palette.mode === 'dark' ? 0.28 : 0.2),
        fontWeight: 560,
        whiteSpace: 'nowrap',
      }}
      {...props}
    />
  );
}

function toneColor(theme: Theme, tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return theme.palette.success.main;
    case 'warning':
      return theme.palette.warning.main;
    case 'danger':
      return theme.palette.error.main;
    case 'info':
      return theme.palette.info.main;
    case 'accent':
      return theme.palette.primary.main;
    default:
      return theme.palette.text.secondary;
  }
}

/** How each backend status should read, in colour. */
export const MEMBERSHIP_STATUS_TONE = {
  ACTIVE: 'success',
  PENDING: 'info',
  FROZEN: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'neutral',
} as const;

export const PAYMENT_STATUS_TONE = {
  COMPLETED: 'success',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'neutral',
} as const;

export const BILLING_STATUS_TONE = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  UNPAID: 'danger',
  OVERPAID: 'info',
} as const;

export const SESSION_STATUS_TONE = {
  SCHEDULED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
} as const;

export const ACCOUNT_STATUS_TONE = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
} as const;

export const ENTRY_TYPE_TONE = {
  INCOME: 'success',
  EXPENSE: 'danger',
  REFUND: 'warning',
} as const;

export const SEVERITY_TONE = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
} as const;
