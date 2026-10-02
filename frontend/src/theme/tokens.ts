/**
 * Design tokens. Everything visual resolves to a value in this file, so a
 * change here moves the whole product rather than one screen.
 */

/** Neutrals carry a trace of blue; pure grey reads as cheap on a dark screen. */
export const neutral = {
  0: '#ffffff',
  25: '#fcfcfd',
  50: '#f8f9fb',
  100: '#f1f2f6',
  200: '#e4e6ed',
  300: '#d1d5e0',
  400: '#9ba3b5',
  500: '#6b7384',
  600: '#4d5565',
  700: '#373e4d',
  800: '#232834',
  850: '#1a1e27',
  900: '#13161d',
  950: '#0c0e13',
} as const;

/** One accent, used sparingly: primary actions, selection, focus. */
export const accent = {
  50: '#eef0ff',
  100: '#e0e3ff',
  200: '#c6cbff',
  300: '#a3a9fc',
  400: '#8286f6',
  500: '#6366ea',
  600: '#5048ce',
  700: '#443ab0',
  800: '#38328e',
  900: '#2f2c71',
} as const;

export const semantic = {
  success: { light: '#16a34a', dark: '#4ade80', surfaceLight: '#ecfdf3', surfaceDark: '#0d2818' },
  warning: { light: '#c2730a', dark: '#fbbf24', surfaceLight: '#fffaeb', surfaceDark: '#2b2008' },
  danger: { light: '#dc2626', dark: '#f87171', surfaceLight: '#fef3f2', surfaceDark: '#2d1212' },
  info: { light: '#0a7ea4', dark: '#38bdf8', surfaceLight: '#eff8ff', surfaceDark: '#0a2232' },
} as const;

/**
 * A system stack rather than a web font: it renders on the first frame with no
 * layout shift, needs no network at build time, and on each platform it is the
 * face that platform's users already read all day.
 */
export const fontStack = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  '"Noto Sans"',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
].join(',');

/** Tabular figures: money in a column must line up digit for digit. */
export const monoStack = [
  'ui-monospace',
  'SFMono-Regular',
  '"SF Mono"',
  'Menlo',
  'Consolas',
  'monospace',
].join(',');

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;

/** 4px base. Every gap in the product is a multiple of it. */
export const SPACING_UNIT = 4;

/**
 * Shadows are layered and low-opacity. One hard drop shadow reads as a 2010s
 * card; two soft layers read as paper lifted off a surface.
 */
export type Elevation = Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string>;

export const shadowsLight: Elevation = {
  xs: '0 1px 2px 0 rgba(16, 24, 40, 0.04)',
  sm: '0 1px 3px 0 rgba(16, 24, 40, 0.08), 0 1px 2px -1px rgba(16, 24, 40, 0.06)',
  md: '0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.04)',
  lg: '0 12px 16px -4px rgba(16, 24, 40, 0.08), 0 4px 6px -2px rgba(16, 24, 40, 0.03)',
  xl: '0 20px 24px -4px rgba(16, 24, 40, 0.10), 0 8px 8px -4px rgba(16, 24, 40, 0.04)',
};

export const shadowsDark: Elevation = {
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.30)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.40), 0 1px 2px -1px rgba(0, 0, 0, 0.30)',
  md: '0 4px 8px -2px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.30)',
  lg: '0 12px 16px -4px rgba(0, 0, 0, 0.50), 0 4px 6px -2px rgba(0, 0, 0, 0.30)',
  xl: '0 20px 24px -4px rgba(0, 0, 0, 0.55), 0 8px 8px -4px rgba(0, 0, 0, 0.35)',
};

/**
 * Durations and easings. Short and sharp — an interface that animates slowly
 * feels slow, however pretty the curve.
 */
export const motion = {
  instant: 90,
  fast: 150,
  normal: 220,
  slow: 320,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 },
} as const;

export const layout = {
  sidebarWidth: 256,
  sidebarCollapsedWidth: 68,
  headerHeight: 60,
  mobileNavHeight: 60,
  contentMaxWidth: 1600,
} as const;

/** Status colour families, shared by chips, dots and chart series. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
