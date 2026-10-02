'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Member, Paginated } from '@/lib/api/types';

/**
 * Find a member by typing.
 *
 * Searches the server rather than filtering a preloaded list: a thousand
 * members is too many to ship to the browser for every dialog, and the
 * backend already knows how to match a name, an email or a member code.
 */
export function MemberPicker({
  value,
  onChange,
  label,
  required = false,
  error,
  autoFocus = false,
  disabled = false,
}: {
  value: Member | null;
  onChange: (member: Member | null) => void;
  label: string;
  required?: boolean;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const [input, setInput] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: keys.members.list({ search: input, limit: 20, status: 'ACTIVE' }),
    queryFn: () =>
      api.get<Paginated<Member>>('members', {
        query: { search: input || undefined, limit: 20, status: 'ACTIVE' },
      }),
    staleTime: 30_000,
  });

  return (
    <Autocomplete<Member>
      value={value}
      onChange={(_, next) => onChange(next)}
      inputValue={input}
      onInputChange={(_, next, reason) => {
        if (reason !== 'reset') setInput(next);
      }}
      options={data?.data ?? []}
      loading={isFetching}
      disabled={disabled}
      getOptionLabel={(option) =>
        `${option.account.firstName} ${option.account.lastName} · ${option.memberCode}`
      }
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      // The backend already matched; filtering again here would hide results
      // that matched on a field the label does not show, such as the email.
      filterOptions={(options) => options}
      noOptionsText={tc('states.noResults')}
      renderOption={(props, option) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <Box component="li" key={key} {...rest}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.account.firstName} {option.account.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {option.memberCode} · {option.account.email}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={Boolean(error)}
          helperText={error ?? t('searchPlaceholder')}
          autoFocus={autoFocus}
          size="small"
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {isFetching ? <CircularProgress size={14} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
