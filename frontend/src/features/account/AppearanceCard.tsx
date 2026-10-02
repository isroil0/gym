'use client';

import { useTranslations } from 'next-intl';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useThemeMode } from '@/providers/ThemeModeProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { DENSITIES, THEME_PREFERENCES, type Density, type ThemePreference } from '@/providers/preferences';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';

/**
 * Appearance and language.
 *
 * All three settings are per-device: the backend exposes no user-preference
 * API, so there is nowhere to store them centrally. The note says so rather
 * than letting somebody wonder why their phone looks different.
 */
export function AppearanceCard() {
  const t = useTranslations('settings.appearance');
  const tt = useTranslations('common.theme');
  const { preference, setPreference, density, setDensity } = useThemeMode();
  const { locale, setLocale } = useLocale();

  return (
    <Card>
      <CardContent>
        <Typography variant="h4">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t('subtitle')}
        </Typography>

        <Stack spacing={2.5} sx={{ maxWidth: 420 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="language-label">{t('language')}</InputLabel>
            <Select
              labelId="language-label"
              label={t('language')}
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {LOCALES.map((option) => (
                <MenuItem key={option} value={option} lang={option}>
                  {LOCALE_LABELS[option]}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{t('languageHint')}</FormHelperText>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="theme-label">{t('theme')}</InputLabel>
            <Select
              labelId="theme-label"
              label={t('theme')}
              value={preference}
              onChange={(event) => setPreference(event.target.value as ThemePreference)}
            >
              {THEME_PREFERENCES.map((option) => (
                <MenuItem key={option} value={option}>
                  {tt(option)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{t('themeHint')}</FormHelperText>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="density-label">{t('density')}</InputLabel>
            <Select
              labelId="density-label"
              label={t('density')}
              value={density}
              onChange={(event) => setDensity(event.target.value as Density)}
            >
              {DENSITIES.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`densityOptions.${option}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">
            {t('storedLocally')}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
