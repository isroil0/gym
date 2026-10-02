'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import type { UseFormRegisterReturn } from 'react-hook-form';

/**
 * Scores a password against the rules that actually apply here.
 *
 * The backend requires ten characters with a letter and a number. Anything
 * beyond that is advice, not a gate, so the meter never blocks submission —
 * it only tells the reader whether they have done better than the minimum.
 */
export function scorePassword(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  const meetsPolicy = value.length >= 10 && /[a-zA-Z]/.test(value) && /\d/.test(value);
  if (!meetsPolicy) return 0;

  let bonus = 0;
  if (value.length >= 14) bonus += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) bonus += 1;
  if (/[^a-zA-Z0-9]/.test(value)) bonus += 1;

  return Math.min(3, 1 + Math.floor(bonus / 1.5)) as 1 | 2 | 3;
}

const STRENGTH = [
  { key: 'weak', color: 'error.main', value: 25 },
  { key: 'fair', color: 'warning.main', value: 50 },
  { key: 'good', color: 'info.main', value: 75 },
  { key: 'strong', color: 'success.main', value: 100 },
] as const;

export function PasswordField({
  register,
  label,
  helperText,
  error,
  autoComplete = 'current-password',
  autoFocus = false,
  disabled = false,
  showStrength = false,
  value = '',
}: {
  register: UseFormRegisterReturn;
  label: string;
  helperText?: string;
  error?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  showStrength?: boolean;
  value?: string;
}) {
  const t = useTranslations('auth.login');
  const ts = useTranslations('auth.passwordStrength');
  const [visible, setVisible] = useState(false);

  const score = showStrength ? scorePassword(value) : 0;
  const strength = STRENGTH[score]!;

  return (
    <Box>
      <TextField
        {...register}
        label={label}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        fullWidth
        error={Boolean(error)}
        helperText={error ?? helperText}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setVisible((current) => !current)}
                  edge="end"
                  size="small"
                  aria-label={visible ? t('hidePassword') : t('showPassword')}
                  disabled={disabled}
                >
                  {visible ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />

      {showStrength && value ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, px: 0.25 }}>
          <LinearProgress
            variant="determinate"
            value={strength.value}
            aria-label={ts('label')}
            sx={{
              flex: 1,
              height: 4,
              bgcolor: 'background.sunken',
              '& .MuiLinearProgress-bar': { bgcolor: strength.color },
            }}
          />
          <Typography variant="caption" sx={{ color: strength.color, fontWeight: 560, minWidth: 52 }}>
            {ts(strength.key)}
          </Typography>
        </Stack>
      ) : null}
    </Box>
  );
}
