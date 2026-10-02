'use client';

import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import CalendarIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useState } from 'react';
import { dateAnchors } from '@/lib/format/datetime';

export interface DateRange {
  from: string;
  to: string;
}

type PresetKey = 'today' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'thisYear';

/**
 * From–to with the handful of ranges anybody actually asks for.
 *
 * Presets resolve in the gym's timezone, so "today" is the gym's today even
 * when the person looking is somewhere else.
 */
export function DateRangePicker({
  value,
  onChange,
  maxDays,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  maxDays?: number;
}) {
  const t = useTranslations('common.periods');
  const tr = useTranslations('reports.range');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const applyPreset = (preset: PresetKey) => {
    const anchors = dateAnchors();
    const ranges: Record<PresetKey, DateRange> = {
      today: { from: anchors.today, to: anchors.today },
      last7Days: { from: anchors.last7, to: anchors.today },
      last30Days: { from: anchors.last30, to: anchors.today },
      thisMonth: { from: anchors.monthStart, to: anchors.today },
      lastMonth: lastMonthRange(anchors.monthStart),
      thisYear: { from: anchors.yearStart, to: anchors.today },
    };
    onChange(ranges[preset]);
    setAnchor(null);
  };

  const invalid = Boolean(value.from && value.to && value.from > value.to);
  const tooLong =
    maxDays !== undefined && !invalid && value.from && value.to
      ? daysBetween(value.from, value.to) > maxDays
      : false;

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
      <TextField
        type="date"
        size="small"
        label={tr('from')}
        value={value.from}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: value.to || undefined } }}
        error={invalid || tooLong}
        sx={{ minWidth: 160 }}
      />
      <TextField
        type="date"
        size="small"
        label={tr('to')}
        value={value.to}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: value.from || undefined } }}
        error={invalid || tooLong}
        helperText={invalid ? tr('invalid') : tooLong ? tr('tooLong', { days: maxDays! }) : undefined}
        sx={{ minWidth: 160 }}
      />
      <Button
        size="small"
        variant="outlined"
        startIcon={<CalendarIcon sx={{ fontSize: 15 }} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ height: 40, flexShrink: 0 }}
      >
        {t('custom')}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(['today', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth', 'thisYear'] as const).map(
          (preset) => (
            <MenuItem key={preset} onClick={() => applyPreset(preset)}>
              {t(preset)}
            </MenuItem>
          ),
        )}
      </Menu>
    </Stack>
  );
}

function lastMonthRange(thisMonthStart: string): DateRange {
  const [year, month] = thisMonthStart.split('-').map(Number);
  const previousMonth = month === 1 ? 12 : month! - 1;
  const previousYear = month === 1 ? year! - 1 : year!;
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  return {
    from: `${previousYear}-${pad(previousMonth)}-01`,
    to: `${previousYear}-${pad(previousMonth)}-${pad(lastDay)}`,
  };
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}
