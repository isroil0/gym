'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { m } from 'motion/react';
import { alpha } from '@mui/material/styles';
import { NavIcon } from './NavIcon';
import { MOBILE_PRIMARY, isActive } from './navigation';
import type { UserRole } from '@/lib/api/types';

/**
 * The phone's tab bar. Four destinations plus "more", each a full-width touch
 * target, sitting above the home indicator on iOS.
 */
export function MobileNav({ role, onOpenMore }: { role: UserRole; onOpenMore: () => void }) {
  const t = useTranslations('navigation');
  const pathname = usePathname();
  const items = MOBILE_PRIMARY[role];

  return (
    <Paper
      component="nav"
      aria-label={t('mainNavigation')}
      elevation={0}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        display: { xs: 'flex', md: 'none' },
        borderTop: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.94),
        backdropFilter: 'saturate(180%) blur(12px)',
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Box
            key={item.href}
            component={Link}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            sx={{
              flex: 1,
              minHeight: (theme) => theme.layout.mobileNavHeight,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              textDecoration: 'none',
              position: 'relative',
              color: active ? 'primary.main' : 'text.secondary',
              '& .MuiSvgIcon-root': { fontSize: 22 },
            }}
          >
            {active ? (
              <Box
                component={m.span}
                layoutId="mobile-active"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                sx={{
                  position: 'absolute',
                  top: 0,
                  width: 28,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                }}
              />
            ) : null}
            <NavIcon name={item.icon} />
            <Typography
              variant="caption"
              sx={{ fontSize: '0.6875rem', fontWeight: active ? 600 : 500, lineHeight: 1 }}
              noWrap
            >
              {t(item.key)}
            </Typography>
          </Box>
        );
      })}

      <Box
        component="button"
        type="button"
        onClick={onOpenMore}
        aria-label={t('more')}
        sx={{
          flex: 1,
          minHeight: (theme) => theme.layout.mobileNavHeight,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.25,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'text.secondary',
          font: 'inherit',
          '& .MuiSvgIcon-root': { fontSize: 22 },
        }}
      >
        <NavIcon name="more" />
        <Typography variant="caption" sx={{ fontSize: '0.6875rem', fontWeight: 500, lineHeight: 1 }}>
          {t('more')}
        </Typography>
      </Box>
    </Paper>
  );
}
