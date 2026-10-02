'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import PersonIcon from '@mui/icons-material/PersonOutlineOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { useSession } from '@/providers/SessionProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const PROFILE_HREF = { ADMIN: '/admin/settings', TRAINER: '/trainer/profile', MEMBER: '/me/profile' };
const SETTINGS_HREF = { ADMIN: '/admin/settings', TRAINER: '/trainer/profile', MEMBER: '/me/profile' };

export function UserMenu() {
  const t = useTranslations('common.labels');
  const ta = useTranslations('auth.logout');
  const tr = useTranslations('common.role');
  const { displayName, initials, role, user, logout } = useSession();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <>
      <Tooltip title={displayName}>
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          size="small"
          aria-label={displayName}
          aria-haspopup="menu"
          aria-expanded={anchor ? 'true' : undefined}
          sx={{ p: 0.25 }}
        >
          <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            {initials}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 232 } } }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography variant="subtitle2" noWrap>
            {displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {user.email}
          </Typography>
          <Typography variant="caption" color="primary.main" sx={{ fontWeight: 560 }}>
            {tr(role)}
          </Typography>
        </Box>
        <Divider sx={{ my: 0.5 }} />

        <MenuItem component={Link} href={PROFILE_HREF[role]} onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.875rem' }}>
            {t('profile')}
          </ListItemText>
        </MenuItem>
        <MenuItem component={Link} href={SETTINGS_HREF[role]} onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.875rem' }}>
            {t('settings')}
          </ListItemText>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setConfirming(true);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.875rem' }}>
            {ta('action')}
          </ListItemText>
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirming}
        title={ta('confirmTitle')}
        body={ta('confirmBody')}
        confirmLabel={ta('action')}
        tone="danger"
        busy={signingOut}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setSigningOut(true);
          await logout();
        }}
      />
    </>
  );
}
