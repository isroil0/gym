'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import StopIcon from '@mui/icons-material/StopRounded';
import CameraswitchIcon from '@mui/icons-material/CameraswitchOutlined';
import type { IScannerControls } from '@zxing/browser';

type ScannerState = 'idle' | 'starting' | 'scanning' | 'unavailable' | 'denied' | 'error';

/**
 * Reads a member's QR card from the camera.
 *
 * The decoder is imported only when the scanner is started: it is a large
 * dependency and most people who open this page on a laptop will use manual
 * check-in instead. The camera stream is stopped on unmount, on error and
 * when the tab is hidden — a camera light left on at a front desk is both
 * rude and a privacy problem.
 *
 * Repeated reads of the same code are ignored for a moment after a scan, so
 * holding a card steady in front of the lens does not fire ten check-ins.
 */
export function QrScanner({
  onScan,
  busy = false,
  paused = false,
}: {
  onScan: (token: string) => void;
  busy?: boolean;
  paused?: boolean;
}) {
  const t = useTranslations('attendance.scanner');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [state, setState] = useState<ScannerState>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('starting');
    try {
      // getUserMedia is unavailable outside a secure context, which is the
      // usual reason this fails on a LAN address.
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setState(window.isSecureContext === false ? 'unavailable' : 'unavailable');
        return;
      }

      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 800,
      });

      const cameras = await BrowserQRCodeReader.listVideoInputDevices().catch(() => []);
      setDevices(cameras);

      const deviceId = cameras[deviceIndex]?.deviceId;
      if (!videoRef.current) return;

      controlsRef.current = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (!result) return;
          const token = result.getText();
          const now = Date.now();
          // Same card still in front of the lens: ignore for a beat.
          if (token === lastScanRef.current.token && now - lastScanRef.current.at < 2500) return;
          lastScanRef.current = { token, at: now };
          onScanRef.current(token);
        },
      );
      setState('scanning');
    } catch (error) {
      const name = (error as DOMException)?.name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      stop();
    }
  }, [deviceIndex, stop]);

  useEffect(() => stop, [stop]);

  // A background tab has no business holding the camera open.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && controlsRef.current) {
        stop();
        setState('idle');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  const message =
    state === 'denied'
      ? t('cameraDenied')
      : state === 'unavailable'
        ? typeof window !== 'undefined' && window.isSecureContext === false
          ? t('notSecureContext')
          : t('cameraUnavailable')
        : state === 'error'
          ? t('cameraError')
          : null;

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          position: 'relative',
          borderRadius: 3,
          overflow: 'hidden',
          bgcolor: 'common.black',
          aspectRatio: '4 / 3',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box
          component="video"
          ref={videoRef}
          muted
          playsInline
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: state === 'scanning' ? 'block' : 'none',
          }}
        />

        {state === 'scanning' ? (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '50% auto auto 50%',
              transform: 'translate(-50%, -50%)',
              width: '58%',
              aspectRatio: '1',
              border: '2px solid',
              borderColor: 'rgba(255,255,255,0.9)',
              borderRadius: 2,
              boxShadow: '0 0 0 100vmax rgba(0,0,0,0.42)',
            }}
          />
        ) : null}

        {state !== 'scanning' ? (
          <Stack alignItems="center" spacing={1.5} sx={{ color: 'common.white', p: 3 }}>
            {state === 'starting' ? (
              <CircularProgress size={28} sx={{ color: 'common.white' }} />
            ) : (
              <QrCodeScannerIcon sx={{ fontSize: 44, opacity: 0.8 }} />
            )}
            <Typography variant="body2" sx={{ opacity: 0.85, textAlign: 'center' }}>
              {state === 'starting' ? t('processing') : t('ready')}
            </Typography>
          </Stack>
        ) : null}

        {busy ? (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(0,0,0,0.55)',
            }}
          >
            <Stack alignItems="center" spacing={1}>
              <CircularProgress sx={{ color: 'common.white' }} />
              <Typography variant="body2" sx={{ color: 'common.white' }}>
                {t('processing')}
              </Typography>
            </Stack>
          </Box>
        ) : null}
      </Box>

      {message ? (
        <Alert severity={state === 'denied' ? 'warning' : 'info'} variant="outlined">
          {message}
        </Alert>
      ) : state === 'scanning' && !paused ? (
        <Typography variant="body2" color="text.secondary" align="center">
          {t('scanning')}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={1} justifyContent="center">
        {state === 'scanning' ? (
          <Button
            onClick={() => {
              stop();
              setState('idle');
            }}
            variant="outlined"
            startIcon={<StopIcon />}
          >
            {t('stop')}
          </Button>
        ) : (
          <Button
            onClick={() => void start()}
            variant="contained"
            startIcon={<QrCodeScannerIcon />}
            disabled={state === 'starting'}
          >
            {t('start')}
          </Button>
        )}

        {devices.length > 1 ? (
          <Button
            onClick={() => {
              stop();
              setDeviceIndex((index) => (index + 1) % devices.length);
              setState('idle');
            }}
            variant="outlined"
            startIcon={<CameraswitchIcon />}
          >
            {t('switchCamera')}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
