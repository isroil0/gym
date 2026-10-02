/** Preferences that must be known on the server to avoid a flash of the wrong UI. */
export const THEME_COOKIE = 'gym_theme';
export const DENSITY_COOKIE = 'gym_density';
export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DENSITIES = ['comfortable', 'standard', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function isDensity(value: unknown): value is Density {
  return typeof value === 'string' && (DENSITIES as readonly string[]).includes(value);
}

/** Writes a preference cookie from the browser. Not secret, so not httpOnly. */
export function persistPreference(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${PREFERENCE_MAX_AGE}; samesite=lax`;
}
