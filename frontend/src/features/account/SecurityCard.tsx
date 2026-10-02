'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { api, logoutRequest } from '@/lib/api/client';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSession } from '@/providers/SessionProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDateTime } from '@/lib/format/datetime';
import { useRouter } from 'next/navigation';

/** Last sign-in, and the "sign out everywhere" escape hatch. */
export function SecurityCard() {
  const t = useTranslations('settings.security');
  const ta = useTranslations('auth.logout');
  const tc = useTranslations('common.labels');
  const { user } = useSession();
  const { locale } = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await api.post('auth/logout-all');
    } finally {
      // The current session's tokens were revoked server-side along with the
      // rest, so the cookies must go whatever happened above.
      await logoutRequest();
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h4">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t('subtitle')}
        </Typography>

        <Stack spacing={1} sx={{ mb: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t('lastLogin')}
            </Typography>
            <Typography variant="body2">
              {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : tc('never')}
            </Typography>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2.5 }} />

        <Stack spacing={1} alignItems="flex-start">
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
            onClick={() => setConfirming(true)}
          >
            {t('signOutEverywhere')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t('signOutEverywhereHint')}
          </Typography>
        </Stack>

        <ConfirmDialog
          open={confirming}
          title={ta('allDevices')}
          body={ta('allDevicesConfirm')}
          confirmLabel={ta('allDevices')}
          tone="danger"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={signOutEverywhere}
        />
      </CardContent>
    </Card>
  );
}
