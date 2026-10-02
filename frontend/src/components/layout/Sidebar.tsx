'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { m } from 'motion/react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuOpenIcon from '@mui/icons-material/MenuOpenRounded';
import { alpha } from '@mui/material/styles';
import { NavIcon } from './NavIcon';
import { NAVIGATION, isActive, type NavItem } from './navigation';
import { Wordmark } from './Wordmark';
import type { UserRole } from '@/lib/api/types';

export function Sidebar({
  role,
  collapsed,
  onToggle,
  onNavigate,
  variant = 'permanent',
}: {
  role: UserRole;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  variant?: 'permanent' | 'drawer';
}) {
  const t = useTranslations('navigation');
  const tc = useTranslations('common.actions');
  const pathname = usePathname();
  const sections = NAVIGATION[role];
  const isCollapsed = variant === 'permanent' && collapsed;

  return (
    <Box
      component="nav"
      aria-label={t('mainNavigation')}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: variant === 'permanent' ? '1px solid' : 'none',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          height: (theme) => theme.layout.headerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          px: isCollapsed ? 0 : 3,
          flexShrink: 0,
        }}
      >
        <Wordmark compact={isCollapsed} />
        {onToggle && !isCollapsed ? (
          <Tooltip title={tc('toggleSidebar')}>
            <IconButton size="small" onClick={onToggle} aria-label={tc('toggleSidebar')}>
              <MenuOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>

      <Stack
        component="ul"
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          listStyle: 'none',
          m: 0,
          px: isCollapsed ? 1.5 : 2,
          pb: 2,
          gap: 0.25,
        }}
      >
        {sections.map((section, index) => (
          <Box component="li" key={section.key ?? `section-${index}`} sx={{ mt: index === 0 ? 0 : 2 }}>
            {section.key && !isCollapsed ? (
              <Typography
                variant="overline"
                component="h2"
                sx={{ px: 1.5, pb: 0.5, display: 'block', color: 'text.secondary' }}
              >
                {t(`sections.${section.key}`)}
              </Typography>
            ) : null}
            {/* A hairline stands in for the heading when collapsed, so the
                grouping survives even without its label. */}
            {section.key && isCollapsed ? (
              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mx: 1, mb: 1 }} />
            ) : null}
            <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0, gap: 0.25 }}>
              {section.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(item, pathname)}
                  collapsed={isCollapsed}
                  label={t(item.key)}
                  onNavigate={onNavigate}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>

      {isCollapsed && onToggle ? (
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'center' }}>
          <Tooltip title={tc('toggleSidebar')} placement="right">
            <IconButton size="small" onClick={onToggle} aria-label={tc('toggleSidebar')}>
              <MenuOpenIcon fontSize="small" sx={{ transform: 'rotate(180deg)' }} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : null}
    </Box>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  label,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  label: string;
  onNavigate?: () => void;
}) {
  const content = (
    <Box
      component={Link}
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        height: 36,
        px: collapsed ? 0 : 1.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 1.5,
        textDecoration: 'none',
        color: active ? 'text.primary' : 'text.secondary',
        fontSize: '0.875rem',
        fontWeight: active ? 560 : 500,
        transition: (theme) => `color ${theme.motion.fast}ms ${theme.motion.easeOut}`,
        '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
        '& .MuiSvgIcon-root': { fontSize: 19, flexShrink: 0 },
      }}
    >
      {/* The highlight is one shared element that slides between items, so
          moving down the list reads as a single object moving, not as two
          separate fades. */}
      {active ? (
        <Box
          component={m.span}
          layoutId="sidebar-active"
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 1.5,
            bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.09),
            zIndex: 0,
          }}
        />
      ) : null}
      <NavIcon
        name={item.icon}
        sx={{ position: 'relative', zIndex: 1, color: active ? 'primary.main' : 'inherit' }}
      />
      {!collapsed ? (
        <Box component="span" sx={{ position: 'relative', zIndex: 1, whiteSpace: 'nowrap' }}>
          {label}
        </Box>
      ) : null}
    </Box>
  );

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      {collapsed ? (
        <Tooltip title={label} placement="right">
          {content}
        </Tooltip>
      ) : (
        content
      )}
    </Box>
  );
}
