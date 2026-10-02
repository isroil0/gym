'use client';

import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { useSession } from '@/providers/SessionProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';

/**
 * Who you are, as the system has you recorded.
 *
 * Name and email are shown read-only for every role: the backend has no
 * endpoint that lets an account change its own name or email address. The
 * notice says so plainly rather than offering a field that cannot save.
 */
export function IdentityCard({ showReadOnlyNotice = false }: { showReadOnlyNotice?: boolean }) {
  const t = useTranslations('settings.profile');
  const tc = useTranslations('common.labels');
  const tr = useTranslations('common.role');
  const { user, displayName, initials, role } = useSession();
  const { locale } = useLocale();

  return (
    <Card>
      <CardContent>
        <Typography variant="h4">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t('subtitle')}
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontSize: '1rem' }}>
            {initials}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" noWrap>
              {displayName}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {user.email}
            </Typography>
          </Box>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          <Field label={tc('role')} value={tr(role)} />
          <Field label={tc('status')} value={user.status} />
          <Field label={tc('phone')} value={user.phone || '—'} />
          <Field label={tc('created')} value={formatDate(user.createdAt, locale, 'long')} />
        </Box>

        {showReadOnlyNotice ? (
          <Alert severity="info" variant="outlined" sx={{ mt: 2.5 }}>
            {t('readOnlyNotice')}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }}>
        {value}
      </Typography>
    </Box>
  );
}
