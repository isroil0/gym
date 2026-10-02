'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import ComputerIcon from '@mui/icons-material/ComputerOutlined';
import { useThemeMode } from '@/providers/ThemeModeProvider';
import { THEME_PREFERENCES, type ThemePreference } from '@/providers/preferences';

const ICONS = {
  light: LightModeIcon,
  dark: DarkModeIcon,
  system: ComputerIcon,
} as const;

export function ThemeToggle() {
  const t = useTranslations('common.theme');
  const { preference, mode, setPreference } = useThemeMode();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // The button shows what is on screen, not what was chosen: on "system" the
  // reader wants to see which way it resolved.
  const Current = mode === 'dark' ? DarkModeIcon : LightModeIcon;

  return (
    <>
      <Tooltip title={t('toggle')}>
        <IconButton
          size="small"
          aria-label={t('toggle')}
          aria-haspopup="menu"
          aria-expanded={anchor ? 'true' : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Current fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {THEME_PREFERENCES.map((option: ThemePreference) => {
          const Icon = ICONS[option];
          return (
            <MenuItem
              key={option}
              role="menuitemradio"
              aria-checked={option === preference}
              selected={option === preference}
              onClick={() => {
                setPreference(option);
                setAnchor(null);
              }}
            >
              <ListItemIcon>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '0.875rem' }}>
                {t(option)}
              </ListItemText>
              {option === preference ? <CheckIcon fontSize="small" color="primary" /> : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
