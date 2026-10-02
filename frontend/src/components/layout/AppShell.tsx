'use client';

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation } from 'motion/react';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { persistPreference } from '@/providers/preferences';
import type { UserRole } from '@/lib/api/types';

const SIDEBAR_COOKIE = 'gym_sidebar';

/**
 * The frame every signed-in page sits in.
 *
 * Desktop gets a persistent, collapsible sidebar; phones get a drawer plus a
 * bottom tab bar. The content column is the only thing that scrolls, so the
 * chrome never drifts off the top of a long table.
 */
export function AppShell({
  role,
  initialCollapsed,
  notifications,
  search,
  children,
}: {
  role: UserRole;
  initialCollapsed: boolean;
  notifications?: React.ReactNode;
  search?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations('common');
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Following a link in the drawer should leave it behind.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      persistPreference(SIDEBAR_COOKIE, next ? 'collapsed' : 'expanded');
      return next;
    });
  }, []);

  const sidebarWidth = collapsed
    ? theme.layout.sidebarCollapsedWidth
    : theme.layout.sidebarWidth;

  return (
    <LazyMotion features={domAnimation} strict>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 8,
          zIndex: 2000,
          px: 2,
          py: 1,
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:focus': { left: 8 },
        }}
      >
        {t('skipToContent')}
      </Box>

      <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: sidebarWidth,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100dvh',
            transition: `width ${theme.motion.normal}ms ${theme.motion.easeOut}`,
          }}
        >
          <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />
        </Box>

        <Drawer
          open={drawerOpen && !isDesktop}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { sx: { width: theme.layout.sidebarWidth } } }}
          ModalProps={{ keepMounted: true }}
        >
          <Sidebar
            role={role}
            collapsed={false}
            variant="drawer"
            onNavigate={() => setDrawerOpen(false)}
          />
        </Drawer>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Header
            onOpenNav={() => setDrawerOpen(true)}
            notifications={notifications}
            search={search}
          />
          <Box
            component="main"
            id="main"
            sx={{
              flex: 1,
              minWidth: 0,
              px: { xs: 2, sm: 3, md: 4 },
              py: { xs: 2.5, md: 3.5 },
              // Room for the tab bar, plus the home indicator on iOS.
              pb: {
                xs: `calc(${theme.layout.mobileNavHeight}px + 24px + env(safe-area-inset-bottom))`,
                md: 5,
              },
              maxWidth: theme.layout.contentMaxWidth,
              width: '100%',
              mx: 'auto',
            }}
          >
            {children}
          </Box>
        </Box>

        <MobileNav role={role} onOpenMore={() => setDrawerOpen(true)} />
      </Box>
    </LazyMotion>
  );
}
