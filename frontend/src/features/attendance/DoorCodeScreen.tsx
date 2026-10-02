'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import FullscreenIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExitRounded';
import QRCode from 'react-qr-code';
import { api } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/feedback/EmptyState';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import type { Schemas } from '@/lib/api/types';

type DoorCode = Schemas['DoorCodeDto'];

/**
 * The code the gym puts on a screen at its entrance.
 *
 * It refreshes itself a moment before the server stops honouring the current
 * one, so the screen is never showing something that would be refused. The
 * countdown is cosmetic — the server decides what is current — but it tells
 * anybody watching that the code is alive, which is what stops members
 * photographing it and assuming it will keep working.
 */
export function DoorCodeScreen() {
  const t = useTranslations('attendance.door');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const [fullscreen, setFullscreen] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['attendance', 'door-code'],
    queryFn: () => api.get<DoorCode>('attendance/door-code'),
    // Never serve this from cache: a stale code is a refused member.
    gcTime: 0,
    staleTime: 0,
  });

  // Refetch just before the server rotates, and keep a visible countdown.
  useEffect(() => {
    if (!data) return;
    const expiresAt = Date.parse(data.expiresAt);

    const tick = () => {
      const left = expiresAt - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) void refetch();
    };

    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [data, refetch]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (isPending) return <DetailSkeleton />;
  if (isError || !data) {
    return (
      <ErrorState
        title={t('error')}
        body={te('generic')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  const total = data.periodSeconds * 1000;
  const progress = Math.min(100, Math.max(0, (remaining / total) * 100));
  const seconds = Math.ceil(remaining / 1000);

  const code = (
    <Box
      sx={{
        // White and quiet-zoned whatever the room's theme: this is a scanner
        // target seen from a metre away, not decoration.
        bgcolor: '#ffffff',
        p: { xs: 3, md: 4 },
        borderRadius: 4,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <QRCode
        value={data.code}
        size={512}
        level="M"
        style={{ width: '100%', height: 'auto', maxWidth: fullscreen ? 560 : 340 }}
      />
    </Box>
  );

  const countdown = (
    <Stack spacing={1} sx={{ width: '100%', maxWidth: fullscreen ? 560 : 340 }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label={t('rotates', { seconds: data.periodSeconds })}
        sx={{ height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" color="text.secondary" align="center">
        {remaining <= 0
          ? t('refreshing')
          : `${t('rotates', { seconds: data.periodSeconds })} · ${seconds}s`}
      </Typography>
    </Stack>
  );

  if (fullscreen) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: (theme) => theme.zIndex.modal + 1,
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          p: 3,
        }}
      >
        <Typography variant="h2" align="center">
          {t('instruction')}
        </Typography>
        {code}
        {countdown}
        <Button onClick={() => setFullscreen(false)} startIcon={<FullscreenExitIcon />} size="large">
          {t('exitFullscreen')}
        </Button>
      </Box>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Stack spacing={2.5} sx={{ maxWidth: 460, mx: 'auto', width: '100%' }}>
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography variant="h4" align="center">
              {t('instruction')}
            </Typography>
            {code}
            {countdown}
            <Button onClick={() => setFullscreen(true)} variant="contained" startIcon={<FullscreenIcon />} fullWidth size="large">
              {t('fullscreen')}
            </Button>
          </CardContent>
        </Card>
        <Alert severity="info" variant="outlined">
          {t('staleWarning')}
        </Alert>
      </Stack>
    </>
  );
}
