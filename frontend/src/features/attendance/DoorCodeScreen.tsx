'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FullscreenIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExitRounded';
import PrintIcon from '@mui/icons-material/PrintRounded';
import AutorenewIcon from '@mui/icons-material/AutorenewRounded';
import QRCode from 'react-qr-code';
import { api } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/feedback/EmptyState';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { useToast } from '@/providers/ToastProvider';
import type { Schemas } from '@/lib/api/types';

type DoorCode = Schemas['DoorCodeDto'];

const DOOR_CODE_KEY = ['attendance', 'door-code'] as const;

/**
 * The code the gym puts on a sign at its entrance.
 *
 * It is the same code every time it is loaded, which is what makes printing
 * it worthwhile: put it up by the turnstile once and members scan it from
 * then on. Nothing on this screen expires, so there is no countdown and
 * nothing to refresh.
 *
 * Reissuing is behind a confirmation because it is the one genuinely
 * destructive thing here: the moment it succeeds, the sign on the wall is
 * wrong and every member who scans it is turned away.
 */
export function DoorCodeScreen() {
  const t = useTranslations('attendance.door');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmReissue, setConfirmReissue] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: DOOR_CODE_KEY,
    queryFn: () => api.get<DoorCode>('attendance/door-code'),
  });

  const reissue = useMutation({
    mutationFn: () => api.post<DoorCode>('attendance/door-code/reissue', {}),
    onSuccess: (next) => {
      queryClient.setQueryData(DOOR_CODE_KEY, next);
      setConfirmReissue(false);
      toast.success(t('reissued', { version: next.version }));
    },
    onError: () => toast.error(te('generic')),
  });

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
        <Card className="door-code-sheet">
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
          >
            <Typography variant="h4" align="center">
              {t('instruction')}
            </Typography>
            {code}
            <Chip
              size="small"
              variant="outlined"
              label={t('version', { version: data.version })}
              className="no-print"
            />
            <Stack direction="row" spacing={1} sx={{ width: '100%' }} className="no-print">
              <Button
                onClick={() => window.print()}
                variant="contained"
                startIcon={<PrintIcon />}
                fullWidth
                size="large"
              >
                {t('print')}
              </Button>
              <Button
                onClick={() => setFullscreen(true)}
                variant="outlined"
                startIcon={<FullscreenIcon />}
                fullWidth
                size="large"
              >
                {t('fullscreen')}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Alert severity="info" variant="outlined" className="no-print">
          {t('printHint')}
        </Alert>

        <Card variant="outlined" className="no-print">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">{t('reissueTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('reissueBody')}
              </Typography>
              <Button
                onClick={() => setConfirmReissue(true)}
                color="warning"
                startIcon={<AutorenewIcon />}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('reissue')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={confirmReissue} onClose={() => setConfirmReissue(false)}>
        <DialogTitle>{t('reissueConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('reissueConfirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReissue(false)} disabled={reissue.isPending}>
            {tc('actions.cancel')}
          </Button>
          <Button
            onClick={() => reissue.mutate()}
            color="warning"
            variant="contained"
            loading={reissue.isPending}
          >
            {t('reissueConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
