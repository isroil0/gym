'use client';

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ArrowUpIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownIcon from '@mui/icons-material/ArrowDownwardRounded';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import Link from 'next/link';
import { alpha } from '@mui/material/styles';
import type { StatusTone } from '@/theme/tokens';

/**
 * One number, told properly: what it is, what it says, and — when there is
 * one — where to go to act on it.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
  trend,
  icon,
  href,
  help,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: StatusTone;
  /** Percentage change against the previous comparable period. */
  trend?: { value: number; label?: string } | null;
  icon?: React.ReactNode;
  href?: string;
  help?: string;
  loading?: boolean;
}) {
  const interactive = Boolean(href);

  return (
    <Card
      {...(interactive ? { component: Link, href: href! } : {})}
      sx={{
        display: 'block',
        textDecoration: 'none',
        height: '100%',
        transition: (theme) =>
          `border-color ${theme.motion.fast}ms ${theme.motion.easeOut}, transform ${theme.motion.fast}ms ${theme.motion.easeOut}`,
        ...(interactive
          ? {
              '&:hover': {
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.4),
                transform: 'translateY(-1px)',
              },
            }
          : {}),
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 540 }}>
              {label}
            </Typography>
            {help ? (
              <Tooltip title={help}>
                <InfoIcon sx={{ fontSize: 13, color: 'text.disabled', cursor: 'help' }} />
              </Tooltip>
            ) : null}
          </Stack>
          {icon ? (
            <Box
              aria-hidden
              sx={{
                color: toneText(tone),
                display: 'grid',
                placeItems: 'center',
                '& .MuiSvgIcon-root': { fontSize: 18 },
              }}
            >
              {icon}
            </Box>
          ) : null}
        </Stack>

        <Typography
          variant="h2"
          className="tabular"
          sx={{
            mt: 1,
            color: tone === 'neutral' ? 'text.primary' : toneText(tone),
            opacity: loading ? 0.35 : 1,
            transition: (theme) => `opacity ${theme.motion.fast}ms`,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>

        {(hint || trend) && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
            {trend ? <TrendBadge value={trend.value} /> : null}
            {hint ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {hint}
              </Typography>
            ) : null}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function TrendBadge({ value }: { value: number }) {
  const up = value > 0;
  const flat = value === 0;
  const color = flat ? 'text.secondary' : up ? 'success.main' : 'error.main';
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color }}>
      {!flat ? <Icon sx={{ fontSize: 13 }} /> : null}
      <Typography variant="caption" sx={{ fontWeight: 580, color: 'inherit' }} className="tabular">
        {Math.abs(value).toFixed(1)}%
      </Typography>
    </Stack>
  );
}

function toneText(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
    case 'danger':
      return 'error.main';
    case 'info':
      return 'info.main';
    case 'accent':
      return 'primary.main';
    default:
      return 'text.secondary';
  }
}
