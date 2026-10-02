'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

/** A titled panel with an optional action in its corner. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  dense = false,
  divided = false,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
  divided?: boolean;
}) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent
        sx={{
          pb: divided ? 2 : 1.5,
          px: dense ? 2 : 2.5,
          pt: dense ? 2 : 2.5,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h2" noWrap>
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
        </Stack>
      </CardContent>
      {divided ? <Divider /> : null}
      <Box
        sx={{
          px: dense ? 2 : 2.5,
          pb: dense ? 2 : 2.5,
          pt: divided ? 2 : 0,
          flex: 1,
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Card>
  );
}
