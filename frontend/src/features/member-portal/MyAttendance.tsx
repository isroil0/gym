'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate, formatDuration, formatTime } from '@/lib/format/datetime';
import type { Attendance, Paginated } from '@/lib/api/types';

/** The member's visit history. */
export function MyAttendance() {
  const t = useTranslations('attendance');
  const { locale } = useLocale();

  const { data, isPending } = useQuery({
    queryKey: keys.attendance.me({ limit: 50 }),
    queryFn: () => api.get<Paginated<Attendance>>('attendance/me', { query: { limit: 50 } }),
  });

  return (
    <>
      <PageHeader title={t('myVisits')} />
      <Card>
        <CardContent>
          {isPending ? (
            <ListSkeleton rows={6} />
          ) : (data?.data.length ?? 0) === 0 ? (
            <EmptyState title={t('empty.title')} body={t('empty.body')} />
          ) : (
            <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {data!.data.map((visit) => (
                <Box
                  component="li"
                  key={visit.id}
                  sx={{
                    py: 1.25,
                    '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="center">
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 540 }}>
                        {formatDate(visit.checkedInAt, locale, 'long')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(visit.checkedInAt, locale)}
                        {visit.checkedOutAt ? ` – ${formatTime(visit.checkedOutAt, locale)}` : ''}
                        {' · '}
                        {t(`method.${visit.method}`)}
                      </Typography>
                    </Box>
                    {visit.stillInside ? (
                      <StatusChip label={t('stillInside')} tone="success" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {formatDuration(visit.durationMinutes ?? null, locale)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </>
  );
}
