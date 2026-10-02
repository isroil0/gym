'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import NotificationsIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useSession } from '@/providers/SessionProvider';

const AREA = { ADMIN: '/admin/notifications', TRAINER: '/trainer/notifications', MEMBER: '/me' };

/**
 * Unread count in the header.
 *
 * Polled rather than pushed: the backend has no realtime channel, and for a
 * count that changes a few times an hour a quiet poll is the honest option.
 */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const { role } = useSession();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ unread: number }>('notifications/unread-count'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unread = data?.unread ?? 0;

  return (
    <Tooltip title={t('unreadCount', { count: unread })}>
      <IconButton
        component={Link}
        href={AREA[role]}
        size="small"
        aria-label={t('unreadCount', { count: unread })}
      >
        <Badge
          badgeContent={unread}
          color="error"
          max={99}
          sx={{ '& .MuiBadge-badge': { fontSize: '0.625rem', height: 16, minWidth: 16 } }}
        >
          <NotificationsIcon fontSize="small" />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
