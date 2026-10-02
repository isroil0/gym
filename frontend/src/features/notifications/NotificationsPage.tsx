'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DoneAllIcon from '@mui/icons-material/DoneAllRounded';
import DeleteIcon from '@mui/icons-material/DeleteOutlineRounded';
import CampaignIcon from '@mui/icons-material/CampaignOutlined';
import { alpha } from '@mui/material/styles';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar } from '@/components/data/FilterBar';
import { ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { StatusChip, SEVERITY_TONE } from '@/components/ui/StatusChip';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatRelative } from '@/lib/format/datetime';
import { AnnouncementDialog } from './AnnouncementDialog';
import { NOTIFICATION_TYPES, type Notification, type Paginated } from '@/lib/api/types';

const DEFAULTS = { page: '1', limit: '25', unread: '', type: '' };

/** What the system has told this account. */
export function NotificationsPage({ canAnnounce = false }: { canAnnounce?: boolean }) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { state, set, clear } = useQueryState(DEFAULTS);
  const [announcing, setAnnouncing] = useState(false);

  const params = {
    page: Number(state.page) || 1,
    limit: Number(state.limit) || 25,
    unread: state.unread === 'true' ? true : undefined,
    type: state.type || undefined,
  };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: keys.notifications.list(params),
    queryFn: () => api.get<Paginated<Notification>>('notifications', { query: params }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.notifications.all });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`notifications/${id}/read`),
    onSuccess: refresh,
  });
  const markAll = useMutation({ mutationFn: () => api.post('notifications/read-all'), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`notifications/${id}`),
    onSuccess: refresh,
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            {canAnnounce ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CampaignIcon sx={{ fontSize: 17 }} />}
                onClick={() => setAnnouncing(true)}
              >
                {t('announcement.create')}
              </Button>
            ) : null}
            <Button
              size="small"
              variant="contained"
              startIcon={<DoneAllIcon sx={{ fontSize: 17 }} />}
              disabled={markAll.isPending}
              onClick={async () => {
                try {
                  await markAll.mutateAsync();
                  toast.success(t('allRead'));
                } catch (error) {
                  toast.error(describe(error));
                }
              }}
            >
              {t('markAllRead')}
            </Button>
          </>
        }
      />

      <FilterBar
        filters={[
          {
            key: 'unread',
            label: t('filters.all'),
            value: state.unread,
            options: [
              { value: '', label: t('filters.all') },
              { value: 'true', label: t('filters.unreadOnly') },
            ],
          },
          {
            key: 'type',
            label: t('filters.type'),
            value: state.type,
            options: [
              { value: '', label: tc('labels.all') },
              ...NOTIFICATION_TYPES.map((type) => ({ value: type, label: t(`type.${type}`) })),
            ],
          },
        ]}
        onFilterChange={(key, value) => set({ [key]: value })}
        onClear={clear}
      />

      {isError ? (
        <ErrorState
          title={tc('states.errorTitle')}
          body={te('generic')}
          onRetry={() => void refetch()}
          retryLabel={tc('actions.retry')}
        />
      ) : isPending ? (
        <ListSkeleton rows={6} />
      ) : (data?.data.length ?? 0) === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title={state.unread === 'true' ? t('empty.unread') : t('empty.title')}
              body={t('empty.body')}
            />
          </CardContent>
        </Card>
      ) : (
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {data!.data.map((notification) => (
            <Card
              component="li"
              key={notification.id}
              sx={{
                bgcolor: (theme) =>
                  notification.read
                    ? 'background.paper'
                    : alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04),
              }}
            >
              <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: notification.read ? 500 : 600 }}>
                        {notification.title}
                      </Typography>
                      <StatusChip
                        label={t(`severity.${notification.severity}`)}
                        tone={SEVERITY_TONE[notification.severity as keyof typeof SEVERITY_TONE] ?? 'neutral'}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {notification.body}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                      {t(`type.${notification.type}`)} · {formatRelative(notification.createdAt, locale)}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                    {!notification.read ? (
                      <Tooltip title={t('markRead')}>
                        <IconButton
                          size="small"
                          aria-label={t('markRead')}
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          <DoneAllIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                    <Tooltip title={t('delete.confirm')}>
                      <IconButton
                        size="small"
                        aria-label={t('delete.confirm')}
                        onClick={async () => {
                          try {
                            await remove.mutateAsync(notification.id);
                            toast.success(t('delete.success'));
                          } catch (error) {
                            toast.error(describe(error));
                          }
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {canAnnounce ? <AnnouncementDialog open={announcing} onClose={() => setAnnouncing(false)} /> : null}
    </>
  );
}
