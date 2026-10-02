'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

/**
 * Skeletons that match the shape of what is coming.
 *
 * A skeleton whose proportions differ from the real content causes a visible
 * jump when the data lands, which reads as slower than showing nothing at all.
 */

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Box role="status" aria-busy="true" sx={{ width: '100%' }}>
      <Stack spacing={0}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <Box
            key={rowIndex}
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 2,
              px: 2,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              // Rows fade out down the list: the eye reads it as content
              // arriving from the top rather than a wall of grey.
              opacity: 1 - rowIndex * (0.5 / rows),
            }}
          >
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                variant="text"
                width={columnIndex === 0 ? '70%' : `${45 + ((rowIndex + columnIndex) % 4) * 12}%`}
                height={18}
              />
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export function MetricCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box
      role="status"
      aria-busy="true"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(2, 1fr)',
          md: `repeat(${Math.min(count, 4)}, 1fr)`,
        },
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent>
            <Skeleton variant="text" width="55%" height={14} />
            <Skeleton variant="text" width="75%" height={32} sx={{ mt: 1 }} />
            <Skeleton variant="text" width="40%" height={14} sx={{ mt: 0.5 }} />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <Box role="status" aria-busy="true" sx={{ p: 2 }}>
      <Skeleton variant="text" width={160} height={18} />
      <Skeleton variant="rounded" height={height} sx={{ mt: 2, borderRadius: 2 }} />
    </Box>
  );
}

export function DetailSkeleton() {
  return (
    <Stack spacing={2} role="status" aria-busy="true">
      <Skeleton variant="text" width={240} height={32} />
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
      <Skeleton variant="rounded" height={240} sx={{ borderRadius: 2 }} />
    </Stack>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Stack spacing={1.5} role="status" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Stack key={index} direction="row" spacing={1.5} alignItems="center">
          <Skeleton variant="circular" width={34} height={34} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="45%" height={16} />
            <Skeleton variant="text" width="30%" height={13} />
          </Box>
          <Skeleton variant="text" width={60} height={16} />
        </Stack>
      ))}
    </Stack>
  );
}
