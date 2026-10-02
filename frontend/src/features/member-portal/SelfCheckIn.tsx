'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import { AnimatePresence } from 'motion/react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { QrScanner } from '@/features/attendance/QrScanner';
import { CheckInResultPanel, type DoorOutcome } from '@/features/attendance/CheckInResultPanel';
import type { CheckInResult } from '@/features/attendance/useAttendance';

/**
 * A member admitting themselves at the door.
 *
 * They scan the gym's screen; their own session says who they are. The
 * result panel is the same component the front desk sees, so a refusal reads
 * identically whoever is looking at it — and the member is told the same
 * reason staff would have been told.
 */
export function SelfCheckIn() {
  const t = useTranslations('attendance.selfScan');
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<DoorOutcome>(null);
  const [scanning, setScanning] = useState(false);

  const checkIn = useMutation({
    mutationFn: (code: string) => api.post<CheckInResult>('attendance/check-in/self', { code }),
    onSuccess: (result) => {
      setOutcome({ kind: 'admitted', result });
      setScanning(false);
      // Days and visits have just changed; the home screen must not lie.
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.member });
      void queryClient.invalidateQueries({ queryKey: keys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: keys.memberships.me });
    },
    onError: (error) => {
      setOutcome({
        kind: 'denied',
        error: error instanceof ApiError ? error : new ApiError(0, null),
      });
      setScanning(false);
    },
  });

  const handleScan = useCallback(
    (code: string) => {
      if (checkIn.isPending) return;
      checkIn.mutate(code);
    },
    [checkIn],
  );

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Stack spacing={2.5} sx={{ maxWidth: 460, mx: 'auto', width: '100%' }}>
        <AnimatePresence mode="wait">
          {outcome ? (
            <CheckInResultPanel
              key="outcome"
              outcome={outcome}
              onDismiss={() => setOutcome(null)}
              dismissLabel={t('again')}
            />
          ) : null}
        </AnimatePresence>

        {!outcome ? (
          scanning ? (
            <Card>
              <CardContent>
                <QrScanner onScan={handleScan} busy={checkIn.isPending} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 72,
                    height: 72,
                    mx: 'auto',
                    mb: 2,
                    borderRadius: 3,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'background.sunken',
                    color: 'primary.main',
                  }}
                >
                  <QrCodeScannerIcon sx={{ fontSize: 36 }} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {t('scanning')}
                </Typography>
                <Button
                  onClick={() => setScanning(true)}
                  variant="contained"
                  size="large"
                  startIcon={<QrCodeScannerIcon />}
                  fullWidth
                  sx={{ py: 1.75, fontSize: '1rem' }}
                >
                  {t('button')}
                </Button>
              </CardContent>
            </Card>
          )
        ) : null}
      </Stack>
    </>
  );
}
