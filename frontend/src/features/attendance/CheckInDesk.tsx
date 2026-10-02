'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoginIcon from '@mui/icons-material/LoginRounded';
import { AnimatePresence } from 'motion/react';
import { ApiError } from '@/lib/api/errors';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { CheckInResultPanel, type DoorOutcome } from './CheckInResultPanel';
import { useManualCheckIn } from './useAttendance';
import type { Member } from '@/lib/api/types';

/**
 * The front desk.
 *
 * Finding the member by name is the only way in from here. Scanning belongs
 * to the door now: the gym's entry code is on a sign at the entrance and
 * members scan it themselves, so staff have no card to hold up to a camera.
 * This is the fallback for a member whose phone is flat or who has no app.
 *
 * The backend decides who may enter; this never second-guesses it, and when
 * the answer is no it repeats the backend's own reason rather than inventing
 * one.
 */
export function CheckInDesk() {
  const t = useTranslations('attendance.checkIn');
  const [member, setMember] = useState<Member | null>(null);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<DoorOutcome>(null);

  const manual = useManualCheckIn();
  const busy = manual.isPending;

  const handleManual = () => {
    if (!member) return;
    const name = `${member.account.firstName} ${member.account.lastName}`;
    manual.mutate(
      { memberId: member.id, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      {
        onSuccess: (result) => {
          setOutcome({ kind: 'admitted', result });
          setMember(null);
          setNotes('');
        },
        onError: (error) =>
          setOutcome({
            kind: 'denied',
            error: error instanceof ApiError ? error : new ApiError(0, null),
            memberName: name,
          }),
      },
    );
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h4">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t('subtitle')}
        </Typography>

        <AnimatePresence mode="wait">
          {outcome ? (
            <CheckInResultPanel
              key="outcome"
              outcome={outcome}
              onDismiss={() => setOutcome(null)}
            />
          ) : null}
        </AnimatePresence>

        <Box sx={{ mt: outcome ? 2.5 : 0 }}>
          <Stack spacing={2}>
            <MemberPicker
              value={member}
              onChange={setMember}
              label={t('searchMember')}
              autoFocus
              disabled={busy}
            />
            <TextField
              size="small"
              label={t('noteOptional')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              fullWidth
            />
            <Button
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              onClick={handleManual}
              disabled={!member || busy}
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('button')}
            </Button>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
