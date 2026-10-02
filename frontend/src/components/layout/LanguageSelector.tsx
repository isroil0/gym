'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import TranslateIcon from '@mui/icons-material/TranslateOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { useLocale } from '@/providers/LocaleProvider';

/** Short codes for the compact variant, where a full language name will not fit. */
const SHORT: Record<Locale, string> = { uz: 'UZ', en: 'EN', ru: 'RU' };

export function LanguageSelector({
  variant = 'icon',
}: {
  variant?: 'icon' | 'button' | 'inline';
}) {
  const t = useTranslations('common.language');
  const { locale, setLocale, isPending } = useLocale();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();

  const choose = (next: Locale) => {
    setAnchor(null);
    setLocale(next);
  };

  const trigger =
    variant === 'icon' ? (
      <Tooltip title={t('change')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('change')}
            aria-controls={anchor ? menuId : undefined}
            aria-haspopup="menu"
            aria-expanded={anchor ? 'true' : undefined}
            onClick={(event) => setAnchor(event.currentTarget)}
            disabled={isPending}
          >
            {isPending ? <CircularProgress size={18} /> : <TranslateIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    ) : (
      <Button
        size="small"
        color="inherit"
        startIcon={isPending ? <CircularProgress size={14} /> : <TranslateIcon fontSize="small" />}
        aria-controls={anchor ? menuId : undefined}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        disabled={isPending}
        sx={{ fontWeight: 540 }}
      >
        {variant === 'inline' ? LOCALE_LABELS[locale] : SHORT[locale]}
      </Button>
    );

  return (
    <>
      {trigger}
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LOCALES.map((option) => (
          <MenuItem
            key={option}
            // menuitemradio is the pattern for "choose exactly one": it makes
            // the current language audible, where the tick is only visible.
            role="menuitemradio"
            aria-checked={option === locale}
            selected={option === locale}
            onClick={() => choose(option)}
            // The language's own name, always written in that language — a
            // Russian speaker should not have to find "Russian" in Uzbek.
            lang={option}
          >
            <ListItemText primaryTypographyProps={{ fontSize: '0.875rem' }}>
              {LOCALE_LABELS[option]}
            </ListItemText>
            {option === locale ? <CheckIcon fontSize="small" color="primary" /> : null}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
