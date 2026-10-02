'use client';

import Link from 'next/link';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLocale } from '@/providers/LocaleProvider';
import { formatMoney } from '@/lib/format/money';
import type { DebtorSummary } from './types';

/** Who owes the most, largest first. */
export function DebtorList({ items }: { items: DebtorSummary[] }) {
  const { locale } = useLocale();

  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.memberId}
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
              <Typography variant="caption" color="text.secondary">
                {item.memberCode}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              className="tabular"
              sx={{ fontWeight: 580, color: 'error.main', flexShrink: 0 }}
            >
              {formatMoney(item.outstanding, locale)}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
