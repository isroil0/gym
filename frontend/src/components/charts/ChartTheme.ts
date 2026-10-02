'use client';

import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';

/**
 * Chart styling pulled from the theme, so charts change with light and dark
 * mode instead of being two sets of hard-coded colours.
 */
export function useChartColors() {
  const theme = useTheme();
  return useMemo(
    () => ({
      revenue: theme.palette.success.main,
      expenses: theme.palette.error.main,
      profit: theme.palette.primary.main,
      visits: theme.palette.info.main,
      neutral: theme.palette.text.secondary,
      grid: theme.palette.divider,
      // A categorical ramp for breakdowns, ordered so neighbours stay apart.
      series: [
        theme.palette.primary.main,
        theme.palette.success.main,
        theme.palette.warning.main,
        theme.palette.info.main,
        theme.palette.error.main,
        theme.palette.secondary.main,
      ],
    }),
    [theme],
  );
}

export function useChartSx() {
  const theme = useTheme();
  return useMemo(
    () => ({
      '& .MuiChartsAxis-tickLabel': {
        fill: `${theme.palette.text.secondary} !important`,
        fontSize: '0.6875rem !important',
      },
      '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': {
        stroke: `${theme.palette.divider} !important`,
      },
      '& .MuiChartsGrid-line': { stroke: theme.palette.divider, strokeDasharray: '3 3' },
      '& .MuiChartsLegend-series text': {
        fill: `${theme.palette.text.secondary} !important`,
        fontSize: '0.75rem !important',
      },
    }),
    [theme],
  );
}
