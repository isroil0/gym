'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme, type ThemeMode } from '@/theme/theme';
import {
  THEME_COOKIE,
  persistPreference,
  type Density,
  type ThemePreference,
} from './preferences';

interface ThemeModeContextValue {
  /** What the reader chose: a fixed mode, or "follow the device". */
  preference: ThemePreference;
  /** What is actually on screen once "system" has been resolved. */
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return context;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function ThemeModeProvider({
  children,
  initialPreference,
  initialDensity,
}: {
  children: React.ReactNode;
  initialPreference: ThemePreference;
  initialDensity: Density;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [density, setDensityState] = useState<Density>(initialDensity);

  // Starts false so the server and the first client render agree. If the
  // device prefers dark and the reader chose "system", the effect below
  // corrects it before paint.
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    setSystemPrefersDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const mode: ThemeMode =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persistPreference(THEME_COOKIE, next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    persistPreference('gym_density', next);
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  // Keeps the browser's own chrome — scrollbars, form controls, the address
  // bar on mobile — in step with the application's theme.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);

  const value = useMemo(
    () => ({ preference, mode, setPreference, density, setDensity }),
    [preference, mode, setPreference, density, setDensity],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme} defaultMode={mode}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
