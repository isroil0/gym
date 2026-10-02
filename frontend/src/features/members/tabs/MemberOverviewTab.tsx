'use client';

import { useTranslations } from 'next-intl';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { useLocale } from '@/providers/LocaleProvider';
import { formatDate } from '@/lib/format/datetime';
import type { Member } from '@/lib/api/types';

/** The member's own details, exactly as the backend holds them. */
export function MemberOverviewTab({ member }: { member: Member }) {
  const t = useTranslations('members');
  const tf = useTranslations('members.fields');
  const tc = useTranslations('common');
  const { locale } = useLocale();

  return (
    <Stack spacing={3}>
      <section>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t('detail.contact')}
        </Typography>
        <DefinitionList
          columns={3}
          items={[
            { label: tc('labels.email'), value: member.account.email },
            { label: tc('labels.phone'), value: member.account.phone },
            { label: tf('address'), value: member.address, wide: !member.account.phone },
          ]}
        />
      </section>

      <Divider />

      <section>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t('detail.personal')}
        </Typography>
        <DefinitionList
          columns={3}
          items={[
            {
              label: tf('dateOfBirth'),
              value: member.dateOfBirth ? formatDate(member.dateOfBirth, locale, 'long') : null,
            },
            {
              label: tf('gender'),
              value: member.gender ? tc(`gender.${member.gender}`) : null,
            },
            { label: tc('labels.created'), value: formatDate(member.joinedAt, locale, 'long') },
          ]}
        />
      </section>

      <Divider />

      <section>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t('detail.emergency')}
        </Typography>
        <DefinitionList
          columns={2}
          items={[
            { label: tf('emergencyContactName'), value: member.emergencyContactName },
            { label: tf('emergencyContactPhone'), value: member.emergencyContactPhone },
          ]}
        />
      </section>

      <Divider />

      <section>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t('detail.internalNotes')}
        </Typography>
        <Typography variant="body2" color={member.notes ? 'text.primary' : 'text.disabled'}>
          {member.notes || t('detail.noNotes')}
        </Typography>
      </section>
    </Stack>
  );
}
