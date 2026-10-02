'use client';

import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The top of every page: where you are, what this is, and the one or two
 * things you are most likely to want to do here.
 */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
  status,
  children,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  /** A chip or badge sitting next to the title. */
  status?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Box component="header" sx={{ mb: { xs: 2.5, md: 3 } }}>
      {crumbs?.length ? (
        <Breadcrumbs
          separator={<ChevronRightIcon sx={{ fontSize: 15 }} />}
          sx={{ mb: 1, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}
        >
          {crumbs.map((crumb) =>
            crumb.href ? (
              <Link
                key={crumb.label}
                component={NextLink}
                href={crumb.href}
                underline="hover"
                color="text.secondary"
                variant="caption"
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} variant="caption" color="text.primary">
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      ) : null}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 1.5, sm: 2 }}
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h1" component="h1" noWrap={false} sx={{ minWidth: 0 }}>
              {title}
            </Typography>
            {status}
          </Stack>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>

        {actions ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexShrink: 0, '& > *': { flex: { xs: 1, sm: 'none' } } }}
          >
            {actions}
          </Stack>
        ) : null}
      </Stack>

      {children ? <Box sx={{ mt: 2 }}>{children}</Box> : null}
    </Box>
  );
}
