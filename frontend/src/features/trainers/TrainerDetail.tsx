'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/EditOutlined';
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined';
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DetailSkeleton, ListSkeleton } from '@/components/feedback/Skeletons';
import { EmptyState, ErrorState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatDate } from '@/lib/format/datetime';
import { formatMoney } from '@/lib/format/money';
import { formatNumber, formatPercent } from '@/lib/format/number';
import { TrainerFormDialog } from './TrainerFormDialog';
import { CompensationDialog } from './CompensationDialog';
import { useArchiveTrainer, useTrainer, useTrainerMembers } from './useTrainers';

/** One trainer: their details, their pay, and the members they coach. */
export function TrainerDetail({ trainerId }: { trainerId: string }) {
  const t = useTranslations('trainers');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();
  const tab = useSearchParams().get('tab') ?? 'overview';

  const [editing, setEditing] = useState(false);
  const [payEditing, setPayEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const { data: trainer, isPending, isError, refetch } = useTrainer(trainerId);
  const members = useTrainerMembers(trainerId);
  const archive = useArchiveTrainer(trainerId);

  if (isPending) return <DetailSkeleton />;
  if (isError || !trainer) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('notFound')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  const name = `${trainer.account.firstName} ${trainer.account.lastName}`;
  const archived = trainer.status === 'ARCHIVED';

  return (
    <>
      <PageHeader
        title={name}
        subtitle={`${trainer.trainerCode}${trainer.specialization ? ` · ${trainer.specialization}` : ''}`}
        crumbs={[{ label: t('title'), href: '/admin/trainers' }, { label: name }]}
        status={
          <StatusChip
            label={tc(`accountStatus.${trainer.status}`)}
            tone={ACCOUNT_STATUS_TONE[trainer.status as keyof typeof ACCOUNT_STATUS_TONE] ?? 'neutral'}
          />
        }
        actions={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PaymentsIcon sx={{ fontSize: 16 }} />}
              onClick={() => setPayEditing(true)}
            >
              {t('compensation.edit')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon sx={{ fontSize: 16 }} />}
              onClick={() => setEditing(true)}
            >
              {tc('actions.edit')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color={archived ? 'primary' : 'error'}
              startIcon={archived ? <RestoreIcon sx={{ fontSize: 16 }} /> : <ArchiveIcon sx={{ fontSize: 16 }} />}
              onClick={() => setArchiving(true)}
            >
              {archived ? tc('actions.reactivate') : tc('actions.archive')}
            </Button>
          </>
        }
      />

      <TabbedSection
        tabs={[
          { value: 'overview', label: t('tabs.overview') },
          { value: 'members', label: t('tabs.members'), badge: trainer.assignedMemberCount },
        ]}
        active={tab}
      >
        {tab === 'members' ? (
          <Card>
            <CardContent>
              {members.isPending ? (
                <ListSkeleton rows={5} />
              ) : (members.data?.data.length ?? 0) === 0 ? (
                <EmptyState title={t('noAssignedMembers')} compact />
              ) : (
                <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {members.data!.data.map((member) => (
                    <Box
                      component="li"
                      key={member.id}
                      sx={{ '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}
                    >
                      <Stack
                        component={Link}
                        href={`/admin/members/${member.id}`}
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                        sx={{
                          py: 1.25,
                          px: 1,
                          mx: -1,
                          borderRadius: 1,
                          textDecoration: 'none',
                          color: 'inherit',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem' }}>
                          {(member.account.firstName[0] ?? '') + (member.account.lastName[0] ?? '')}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>
                            {member.account.firstName} {member.account.lastName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {member.memberCode}
                          </Typography>
                        </Box>
                        <StatusChip
                          label={tc(`accountStatus.${member.status}`)}
                          tone={
                            ACCOUNT_STATUS_TONE[member.status as keyof typeof ACCOUNT_STATUS_TONE] ??
                            'neutral'
                          }
                        />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}>
                    {(trainer.account.firstName[0] ?? '') + (trainer.account.lastName[0] ?? '')}
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {trainer.account.email}
                    </Typography>
                  </Box>
                </Stack>

                <DefinitionList
                  columns={3}
                  items={[
                    { label: tc('labels.phone'), value: trainer.account.phone },
                    { label: t('fields.specialization'), value: trainer.specialization },
                    {
                      label: t('fields.hiredAt'),
                      value: trainer.hiredAt ? formatDate(trainer.hiredAt, locale, 'long') : null,
                    },
                    {
                      label: t('stats.assignedMembers'),
                      value: formatNumber(trainer.assignedMemberCount, locale),
                    },
                    { label: t('fields.certifications'), value: trainer.certifications, wide: true },
                    { label: t('fields.bio'), value: trainer.bio, wide: true },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h5" sx={{ mb: 1.5 }}>
                  {t('compensation.title')}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <DefinitionList
                  columns={3}
                  items={[
                    {
                      label: t('compensation.type'),
                      value: t(`compensation.types.${trainer.compensationType ?? 'NONE'}`),
                    },
                    {
                      label: t('compensation.baseSalary'),
                      value: trainer.monthlySalary ? formatMoney(trainer.monthlySalary, locale) : null,
                    },
                    {
                      label: t('compensation.commissionPercent'),
                      value: trainer.commissionRate
                        ? formatPercent(trainer.commissionRate, locale)
                        : null,
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </Stack>
        )}
      </TabbedSection>

      <TrainerFormDialog open={editing} trainer={trainer} onClose={() => setEditing(false)} />
      <CompensationDialog open={payEditing} trainer={trainer} onClose={() => setPayEditing(false)} />

      <ConfirmDialog
        open={archiving}
        title={archived ? t('reactivate.title') : t('archive.title')}
        body={archived ? t('reactivate.body', { name }) : t('archive.body', { name })}
        confirmLabel={archived ? t('reactivate.confirm') : t('archive.confirm')}
        tone={archived ? 'default' : 'danger'}
        busy={archive.isPending}
        onCancel={() => setArchiving(false)}
        onConfirm={async () => {
          try {
            await archive.mutateAsync(!archived);
            toast.success(archived ? t('reactivate.success') : t('archive.success'));
            setArchiving(false);
          } catch (error) {
            toast.error(describe(error));
          }
        }}
      />
    </>
  );
}
