'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import EditIcon from '@mui/icons-material/EditOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedSection } from '@/components/ui/TabbedSection';
import { StatusChip, ACCOUNT_STATUS_TONE } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DetailSkeleton } from '@/components/feedback/Skeletons';
import { ErrorState } from '@/components/feedback/EmptyState';
import { useLocale } from '@/providers/LocaleProvider';
import { useToast } from '@/providers/ToastProvider';
import { useApiErrorMessage } from '@/lib/forms/useApiForm';
import { formatDate } from '@/lib/format/datetime';
import { MemberFormDialog } from './MemberFormDialog';
import { AssignTrainerDialog } from './AssignTrainerDialog';
import { useArchiveMember, useMember } from './useMembers';
import { MemberTrainerTab } from './tabs/MemberTrainerTab';
import { MemberOverviewTab } from './tabs/MemberOverviewTab';
import { MemberMembershipTab } from './tabs/MemberMembershipTab';
import { MemberPaymentsTab } from './tabs/MemberPaymentsTab';

/**
 * Everything about one member, grouped the way the front desk thinks about
 * them. The tab is in the URL so a link points at what the sender was reading.
 */
export function MemberDetail({ memberId }: { memberId: string }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { locale } = useLocale();
  const toast = useToast();
  const describe = useApiErrorMessage();
  const tab = useSearchParams().get('tab') ?? 'overview';

  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const { data: member, isPending, isError, refetch } = useMember(memberId);
  const archive = useArchiveMember(memberId);

  if (isPending) return <DetailSkeleton />;
  if (isError || !member) {
    return (
      <ErrorState
        title={tc('states.errorTitle')}
        body={te('notFound')}
        onRetry={() => void refetch()}
        retryLabel={tc('actions.retry')}
      />
    );
  }

  const name = `${member.account.firstName} ${member.account.lastName}`;
  const archived = member.status === 'ARCHIVED';

  const tabs = [
    { value: 'overview', label: t('tabs.overview') },
    { value: 'membership', label: t('tabs.membership') },
    { value: 'payments', label: t('tabs.payments') },
    { value: 'trainer', label: t('tabs.trainer') },
  ];

  return (
    <>
      <PageHeader
        title={name}
        subtitle={`${member.memberCode} · ${t('detail.memberSince', {
          date: formatDate(member.joinedAt, locale, 'long'),
        })}`}
        crumbs={[{ label: t('title'), href: '/admin/members' }, { label: name }]}
        status={
          <StatusChip
            label={tc(`accountStatus.${member.status}`)}
            tone={ACCOUNT_STATUS_TONE[member.status as keyof typeof ACCOUNT_STATUS_TONE] ?? 'neutral'}
          />
        }
        actions={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setAssigning(true)}
              disabled={archived}
            >
              {member.assignedTrainer ? t('actions.changeTrainer') : t('actions.assignTrainer')}
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
              startIcon={
                archived ? <RestoreIcon sx={{ fontSize: 16 }} /> : <ArchiveIcon sx={{ fontSize: 16 }} />
              }
              onClick={() => setArchiving(true)}
            >
              {archived ? tc('actions.reactivate') : tc('actions.archive')}
            </Button>
          </>
        }
      />

      <TabbedSection tabs={tabs} active={tab}>
        {tab === 'membership' ? (
          <MemberMembershipTab member={member} />
        ) : tab === 'payments' ? (
          <MemberPaymentsTab member={member} />
        ) : tab === 'trainer' ? (
          <MemberTrainerTab member={member} onAssign={() => setAssigning(true)} />
        ) : (
          <Card>
            <CardContent>
              <MemberOverviewTab member={member} />
            </CardContent>
          </Card>
        )}
      </TabbedSection>

      <MemberFormDialog open={editing} member={member} onClose={() => setEditing(false)} />
      <AssignTrainerDialog open={assigning} member={member} onClose={() => setAssigning(false)} />

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
