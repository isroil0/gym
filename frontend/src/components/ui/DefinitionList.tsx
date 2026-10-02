'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface Definition {
  label: string;
  value: React.ReactNode;
  /** Takes the full width instead of sharing a row — for notes and addresses. */
  wide?: boolean;
}

/** Label-and-value pairs in a responsive grid. */
export function DefinitionList({ items, columns = 2 }: { items: Definition[]; columns?: number }) {
  return (
    <Box
      component="dl"
      sx={{
        display: 'grid',
        gap: 2,
        m: 0,
        gridTemplateColumns: {
          xs: '1fr',
          sm: `repeat(${Math.min(columns, 2)}, minmax(0, 1fr))`,
          md: `repeat(${columns}, minmax(0, 1fr))`,
        },
      }}
    >
      {items.map((item) => (
        <Box key={item.label} sx={item.wide ? { gridColumn: '1 / -1' } : undefined}>
          <Typography component="dt" variant="caption" color="text.secondary" display="block">
            {item.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25 }}>
            {item.value || '—'}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
