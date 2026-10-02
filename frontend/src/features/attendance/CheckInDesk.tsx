'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoginIcon from '@mui/icons-material/LoginRounded';
import { AnimatePresence } from 'motion/react';
import { ApiError } from '@/lib/api/errors';
import { MemberPicker } from '@/features/memberships/MemberPicker';
import { CheckInResultPanel, type DoorOutcome } from './CheckInResultPanel';
import { QrScanner } from './QrScanner';
import { useManualCheckIn, useQrCheckIn } from './useAttendance';
import type { Member } from '@/lib/api/types';

/**
 * The front desk.
 *
 * Two ways in — scan a card or find the member by name — and one answer,
 * shown identically whichever route was taken. The backend decides who may
 * enter; this never second-guesses it, and when the answer is no it repeats
 * the backend's own reason rather than inventing one.
 */
export function CheckInDesk() {
  const t = useTranslations('attendance.checkIn');
  const ts = useTranslations('attendance.scanner');
  const [mode, setMode] = useState<'qr' | 'manual'>('qr');
  const [member, setMember] = useState<Member | null>(null);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<DoorOutcome>(null);

  const qr = useQrCheckIn();
  const manual = useManualCheckIn();
  const busy = qr.isPending || manual.isPending;

  const handleScan = useCallback(
    (token: string) => {
      if (qr.isPending) return;
      qr.mutate(
        { token },
        {
          onSuccess: (result) => setOutcome({ kind: 'admitted', result }),
          onError: (error) =>
            setOutcome({
              kind: 'denied',
              error: error instanceof ApiError ? error : new ApiError(0, null),
            }),
        },
      );
    },
    [qr],
  );

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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          {t('subtitle')}
        </Typography>

        <Tabs
          value={mode}
          onChange={(_, value: 'qr' | 'manual') => {
            setMode(value);
            setOutcome(null);
          }}
          sx={{ mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tab value="qr" label={ts('title')} />
          <Tab value="manual" label={t('manual')} />
        </Tabs>

        <AnimatePresence mode="wait">
          {outcome ? (
            <CheckInResultPanel
              key="outcome"
              outcome={outcome}
              onDismiss={() => setOutcome(null)}
              dismissLabel={mode === 'qr' ? ts('scanAgain') : undefined}
            />
          ) : null}
        </AnimatePresence>

        <Box sx={{ mt: outcome ? 2.5 : 0 }}>
          {mode === 'qr' ? (
            <QrScanner onScan={handleScan} busy={busy} paused={Boolean(outcome)} />
          ) : (
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
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
