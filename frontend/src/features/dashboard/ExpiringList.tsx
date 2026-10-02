'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import type { ExpiringMembership } from './types';

/** Memberships lapsing within the week, soonest first. */
export function ExpiringList({ items }: { items: ExpiringMembership[] }) {
  const t = useTranslations('memberships');
  const { locale } = useLocale();

  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.membershipId}
          sx={{ '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}
        >
          <Stack
            component={Link}
            href={`/admin/members/${item.memberId}`}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={{
              py: 1.25,
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': { bgcolor: 'action.hover' },
              mx: -1,
              px: 1,
              borderRadius: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                {item.memberName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {item.memberCode} · {item.planName}
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
              <StatusChip
                label={t('statusHint.ACTIVE', { count: item.daysRemaining, date: '' })}
                tone={item.daysRemaining <= 3 ? 'danger' : 'warning'}
              />
              <Typography variant="caption" color="text.secondary">
                {formatDate(item.endDate, locale)}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
