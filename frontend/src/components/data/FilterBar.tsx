'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ClearIcon from '@mui/icons-material/FilterAltOffOutlined';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  /** Query key this filter maps to. */
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
}

/**
 * The row of controls above a table.
 *
 * Active filters are also shown as removable chips. In a list of a thousand
 * members, "why am I seeing only four?" should be answerable without opening
 * every dropdown to check.
 */
export function FilterBar({
  search,
  filters,
  onFilterChange,
  onClear,
  actions,
  children,
}: {
  search?: React.ReactNode;
  filters?: FilterDefinition[];
  onFilterChange?: (key: string, value: string) => void;
  onClear?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations('common.actions');
  const active = (filters ?? []).filter((filter) => filter.value !== '');

  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        {search}

        {filters?.length ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              flexWrap: { xs: 'nowrap', md: 'wrap' },
              overflowX: { xs: 'auto', md: 'visible' },
              // Horizontal scroll on a phone beats wrapping six selects into
              // a wall that pushes the table off the screen.
              pb: { xs: 0.5, md: 0 },
              mx: { xs: -0.5, md: 0 },
              px: { xs: 0.5, md: 0 },
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {filters.map((filter) => (
              <TextField
                key={filter.key}
                select
                size="small"
                label={filter.label}
                value={filter.value}
                onChange={(event) => onFilterChange?.(filter.key, event.target.value)}
                sx={{ minWidth: 150, flexShrink: 0 }}
              >
                <MenuItem value="">
                  <em>{filter.options[0]?.value === '' ? filter.options[0].label : '—'}</em>
                </MenuItem>
                {filter.options
                  .filter((option) => option.value !== '')
                  .map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
              </TextField>
            ))}
          </Stack>
        ) : null}

        {children}

        <Box sx={{ flex: 1 }} />
        {actions ? (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>

      {active.length > 0 ? (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {active.map((filter) => (
            <Chip
              key={filter.key}
              size="small"
              variant="outlined"
              label={`${filter.label}: ${
                filter.options.find((option) => option.value === filter.value)?.label ?? filter.value
              }`}
              onDelete={() => onFilterChange?.(filter.key, '')}
            />
          ))}
          {onClear ? (
            <Button size="small" onClick={onClear} startIcon={<ClearIcon sx={{ fontSize: 15 }} />}>
              {t('clearAll')}
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
