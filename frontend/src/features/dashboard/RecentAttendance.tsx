'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { formatRelative, formatTime } from '@/lib/format/datetime';
import { StatusChip } from '@/components/ui/StatusChip';
import type { Attendance, Paginated } from '@/lib/api/types';

const QUERY = { page: 1, limit: 6 };

/** Who came in most recently, and who is still inside. */
export function RecentAttendance() {
  const t = useTranslations('attendance');
  const { locale } = useLocale();

  const { data, isPending } = useQuery({
    queryKey: keys.attendance.list(QUERY),
    queryFn: () => api.get<Paginated<Attendance>>('attendance', { query: QUERY }),
    refetchInterval: 60_000,
  });

  if (isPending) return <ListSkeleton rows={4} />;
  if (!data || data.data.length === 0) {
    return <EmptyState title={t('empty.today')} compact />;
  }

  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {data.data.map((visit) => (
        <Box
          component="li"
          key={visit.id}
          sx={{
            py: 1.25,
            '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {visit.memberName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {visit.memberCode} · {t(`method.${visit.method}`)} ·{' '}
                {formatRelative(visit.checkedInAt, locale)}
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
              {visit.stillInside ? (
                <StatusChip label={t('stillInside')} tone="success" />
              ) : (
                <Typography variant="caption" color="text.secondary" className="tabular">
                  {formatTime(visit.checkedInAt, locale)}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
