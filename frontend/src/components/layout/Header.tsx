'use client';

import { useTranslations } from 'next-intl';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import MenuIcon from '@mui/icons-material/MenuRounded';
import { alpha } from '@mui/material/styles';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

/**
 * The top bar. Deliberately thin: the page below owns the title and the
 * actions, so the chrome does not compete with the work.
 */
export function Header({
  onOpenNav,
  notifications,
  search,
}: {
  onOpenNav: () => void;
  notifications?: React.ReactNode;
  search?: React.ReactNode;
}) {
  const t = useTranslations('common.actions');

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        // Translucent with a blur: content scrolling underneath stays
        // legible as a hint of motion without bleeding through as noise.
        backdropFilter: 'saturate(180%) blur(12px)',
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.82),
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.drawer - 1,
      }}
    >
      <Toolbar
        sx={{
          minHeight: (theme) => `${theme.layout.headerHeight}px !important`,
          gap: 1,
          px: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Tooltip title={t('openMenu')}>
          <IconButton
            edge="start"
            onClick={onOpenNav}
            aria-label={t('openMenu')}
            sx={{ display: { md: 'none' } }}
            size="small"
          >
            <MenuIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
          <Wordmark compact />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
          {search}
        </Box>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          {notifications}
          <LanguageSelector />
          <ThemeToggle />
          <Box sx={{ pl: 0.5 }}>
            <UserMenu />
          </Box>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
