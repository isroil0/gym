'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import type { Member } from '@/lib/api/types';

/** Who coaches this member, and since when. */
export function MemberTrainerTab({
  member,
  onAssign,
}: {
  member: Member;
  onAssign: () => void;
}) {
  const t = useTranslations('members');
  const tt = useTranslations('trainers');
  const tc = useTranslations('common');
  const { locale } = useLocale();
  const trainer = member.assignedTrainer;

  if (!trainer) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title={t('detail.noTrainer')}
            body={t('assignTrainer.body', {
              name: `${member.account.firstName} ${member.account.lastName}`,
            })}
            action={
              <Button
                variant="contained"
                size="small"
                startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
                onClick={onAssign}
                disabled={member.status === 'ARCHIVED'}
              >
                {t('actions.assignTrainer')}
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Avatar sx={{ width: 44, height: 44, bgcolor: 'primary.main' }}>
              {(trainer.firstName[0] ?? '') + (trainer.lastName[0] ?? '')}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h4" noWrap>
                  {trainer.firstName} {trainer.lastName}
                </Typography>
                <StatusChip
                  label={tc(`accountStatus.${trainer.status}`)}
                  tone={
                    ACCOUNT_STATUS_TONE[trainer.status as keyof typeof ACCOUNT_STATUS_TONE] ??
                    'neutral'
                  }
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {trainer.trainerCode}
                {trainer.specialization ? ` · ${trainer.specialization}` : ''}
              </Typography>
              {member.assignedAt ? (
                <Typography variant="caption" color="text.secondary">
                  {tc('labels.created')}: {formatDate(member.assignedAt, locale, 'long')}
                </Typography>
              ) : null}
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button component={Link} href={`/admin/trainers/${trainer.id}`} size="small" variant="outlined">
              {tt('one')}
            </Button>
            <Button size="small" variant="outlined" onClick={onAssign} disabled={member.status === 'ARCHIVED'}>
              {t('actions.changeTrainer')}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
