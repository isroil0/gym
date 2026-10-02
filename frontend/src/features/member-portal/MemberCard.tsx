'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FullscreenIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExitRounded';
import RefreshIcon from '@mui/icons-material/AutorenewRounded';
import QRCode from 'react-qr-code';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import { useCardActions, useMyCard } from '@/features/attendance/useAttendance';

/**
 * The member's QR card.
 *
 * Rendered as an SVG from the token the backend derives — nothing personal is
 * encoded in it, and nothing is stored. The code is drawn on a white panel
 * whatever the theme, because a scanner reading a dark-mode QR off a phone at
 * a turnstile is a bad time for everyone.
 */
export function MemberCard() {
  const t = useTranslations('attendance.card');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const toast = useToast();
  const describe = useApiErrorMessage();
  const { locale } = useLocale();

  const [fullscreen, setFullscreen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const { data: card, isPending, isError, refetch } = useMyCard();
  const { regenerate } = useCardActions();

  // A QR code is unreadable at low brightness. Nudging the screen awake is
  // the most that is possible from a web page; the hint covers the rest.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (isPending) return <DetailSkeleton />;
  if (isError || !card) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('generic')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  if (!card.active) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Card>
          <CardContent>
            <EmptyState title={t('revoked')} body={t('revokedBody')} />
          </CardContent>
        </Card>
      </>
    );
  }

  const code = (
    <Box
      sx={{
        // Always white, always with a quiet zone: this is a scanner target,
        // not decoration.
        bgcolor: '#ffffff',
        p: 2.5,
        borderRadius: 3,
        display: 'grid',
        placeItems: 'center',
        width: '100%',
      }}
    >
      <QRCode
        value={card.token}
        size={256}
        style={{ width: '100%', height: 'auto', maxWidth: fullscreen ? 420 : 300 }}
        viewBox="0 0 256 256"
        level="M"
      />
    </Box>
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
        <Box sx={{ width: '100%', maxWidth: 460 }}>{code}</Box>
        <Stack alignItems="center" spacing={0.5}>
          <Typography variant="h3">{card.memberName}</Typography>
          <Typography variant="body2" color="text.secondary" className="mono">
            {card.memberCode}
          </Typography>
        </Stack>
        <Button
          onClick={() => setFullscreen(false)}
          variant="outlined"
          startIcon={<FullscreenExitIcon />}
          size="large"
        >
          {t('exitFullscreen')}
        </Button>
      </Box>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Stack spacing={2.5} sx={{ maxWidth: 440, mx: 'auto', width: '100%' }}>
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            {code}

            <Stack alignItems="center" spacing={0.25}>
              <Typography variant="h4">{card.memberName}</Typography>
              <Typography variant="body2" color="text.secondary" className="mono">
                {card.memberCode}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {t('version', { version: card.version })} · {formatDate(card.issuedAt, locale)}
              </Typography>
            </Stack>

            <Button
              onClick={() => setFullscreen(true)}
              variant="contained"
              startIcon={<FullscreenIcon />}
              fullWidth
              size="large"
            >
              {t('fullscreen')}
            </Button>
          </CardContent>
        </Card>

        <Alert severity="info" variant="outlined">
          {t('brightnessHint')}
        </Alert>

        <Button
          onClick={() => setRegenerating(true)}
          variant="text"
          color="inherit"
          startIcon={<RefreshIcon sx={{ fontSize: 17 }} />}
          size="small"
        >
          {t('regenerate')}
        </Button>
      </Stack>

      <ConfirmDialog
        open={regenerating}
        title={t('regenerateTitle')}
        body={t('regenerateBody')}
        confirmLabel={t('regenerate')}
        tone="danger"
        busy={regenerate.isPending}
        onCancel={() => setRegenerating(false)}
        onConfirm={async () => {
          try {
            await regenerate.mutateAsync();
            toast.success(t('regenerateSuccess'));
            setRegenerating(false);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />
    </>
  );
}
