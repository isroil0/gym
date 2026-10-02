'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircleIcon from '@mui/icons-material/Circle';
import { CURRENCY } from '@/lib/format/money';
import { DISPLAY_TIMEZONE } from '@/lib/format/datetime';

/**
 * What this client is configured to talk to and how it formats things.
 *
 * The gym's own name, currency and timezone live in the backend's
 * `app_settings` table, but no controller exposes them — so they cannot be
 * read or edited here. The notice says exactly that instead of showing an
 * empty form that would never save.
 */
export function SystemCard() {
  const t = useTranslations('settings.gym');
  const ta = useTranslations('settings.about');

  const { data, isPending } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      const body = (await response.json()) as { ok: boolean };
      return body.ok;
    },
    // Only a connectivity light; it does not need to be fresh to the second.
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const rows: Array<[string, string]> = [
    [t('timezone'), DISPLAY_TIMEZONE],
    [t('currency'), CURRENCY],
    [ta('apiUrl'), process.env.NEXT_PUBLIC_API_URL || '—'],
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h4">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t('subtitle')}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {rows.map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary" display="block">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>

        {!isPending ? (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 2 }}>
            <CircleIcon
              sx={{ fontSize: 9, color: data ? 'success.main' : 'error.main' }}
              aria-hidden
            />
            <Typography variant="caption" color="text.secondary">
              {data ? ta('connected') : ta('disconnected')}
            </Typography>
          </Stack>
        ) : null}

        <Alert severity="info" variant="outlined" sx={{ mt: 2.5 }}>
          {t('readOnlyNotice')}
        </Alert>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t('displayOnly')}
        </Typography>
      </CardContent>
    </Card>
  );
}
