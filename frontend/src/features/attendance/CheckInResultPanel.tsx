'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import BlockIcon from '@mui/icons-material/DoNotDisturbOnRounded';
import { m } from 'motion/react';
import { alpha } from '@mui/material/styles';
import { type ApiError } from '@/lib/api/errors';
import { useLocale } from '@/providers/LocaleProvider';
import { formatTime } from '@/lib/format/datetime';
import { ENTRY_DENIAL_REASONS, type EntryDenialReason } from '@/lib/api/types';
import type { CheckInResult } from './useAttendance';

export type DoorOutcome =
  | { kind: 'admitted'; result: CheckInResult }
  | { kind: 'denied'; error: ApiError; memberName?: string }
  | null;

/**
 * The answer at the door, large enough to read from arm's length.
 *
 * Green or red carries the message at a glance, but never alone: the words
 * say it too, and the panel is announced to assistive technology. Somebody
 * who cannot distinguish the two colours still has to be able to work the
 * front desk.
 */
export function CheckInResultPanel({
  outcome,
  onDismiss,
  dismissLabel,
}: {
  outcome: DoorOutcome;
  onDismiss: () => void;
  dismissLabel?: string;
}) {
  const t = useTranslations('attendance');
  const tc = useTranslations('common.actions');
  const { locale } = useLocale();

  if (!outcome) return null;

  const admitted = outcome.kind === 'admitted';
  const name = admitted ? outcome.result.attendance.memberName : outcome.memberName;

  return (
    <Box
      component={m.div}
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      role="status"
      aria-live="assertive"
      sx={{
        p: 3,
        borderRadius: 3,
        border: '1px solid',
        borderColor: (theme) =>
          alpha(admitted ? theme.palette.success.main : theme.palette.error.main, 0.35),
        bgcolor: (theme) =>
          alpha(
            admitted ? theme.palette.success.main : theme.palette.error.main,
            theme.palette.mode === 'dark' ? 0.12 : 0.07,
          ),
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box sx={{ color: admitted ? 'success.main' : 'error.main', lineHeight: 0, pt: 0.25 }}>
          {admitted ? <CheckCircleIcon sx={{ fontSize: 40 }} /> : <BlockIcon sx={{ fontSize: 40 }} />}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h3" sx={{ color: admitted ? 'success.main' : 'error.main' }}>
            {admitted ? t('checkIn.admitted') : t('checkIn.denied')}
          </Typography>

          {name ? (
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 560 }}>
              {name}
            </Typography>
          ) : null}

          {admitted ? (
            <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {outcome.result.attendance.memberCode} ·{' '}
                {t(`method.${outcome.result.attendance.method}`)} ·{' '}
                {formatTime(outcome.result.attendance.checkedInAt, locale)}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body1" sx={{ mt: 0.75 }}>
              {denialMessage(outcome.error, t)}
            </Typography>
          )}

          {admitted ? <AdmittedWarnings result={outcome.result} /> : null}
        </Box>
      </Stack>

      <Button onClick={onDismiss} variant="outlined" size="small" sx={{ mt: 2 }} autoFocus>
        {dismissLabel ?? tc('dismiss')}
      </Button>
    </Box>
  );
}

/** Things worth telling the member while they are standing there. */
function AdmittedWarnings({ result }: { result: CheckInResult }) {
  const t = useTranslations('attendance.warnings');
  const warnings: string[] = [];

  if (result.visitsRemaining !== null && result.visitsRemaining !== undefined && result.visitsRemaining <= 3) {
    warnings.push(t('lowVisits', { count: result.visitsRemaining }));
  }
  if (
    result.membershipDaysRemaining !== null &&
    result.membershipDaysRemaining !== undefined &&
    result.membershipDaysRemaining <= 7
  ) {
    warnings.push(t('expiringSoon', { count: result.membershipDaysRemaining }));
  }

  if (warnings.length === 0) return null;

  return (
    <Stack spacing={0.5} sx={{ mt: 1.25 }}>
      {warnings.map((warning) => (
        <Typography key={warning} variant="body2" sx={{ color: 'warning.main', fontWeight: 540 }}>
          {warning}
        </Typography>
      ))}
    </Stack>
  );
}

/**
 * The backend names the reason in `details[0].messages[0]` as one of its
 * `EntryDenialReason` values. Translating the code gives the reader their own
 * language; anything unrecognised falls back to the server's own sentence
 * rather than a shrug.
 */
export function denialMessage(
  error: ApiError,
  t: (key: string) => string,
): string {
  const reason = error.reason;
  if (reason && (ENTRY_DENIAL_REASONS as readonly string[]).includes(reason)) {
    return t(`denial.${reason as EntryDenialReason}`);
  }
  return error.message || t('denial.UNKNOWN');
}
