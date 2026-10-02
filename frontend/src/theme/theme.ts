'use client';

import { alpha, createTheme, type Theme } from '@mui/material/styles';
import {
  SPACING_UNIT,
  type Elevation,
  accent,
  fontStack,
  layout,
  monoStack,
  motion,
  neutral,
  radius,
  semantic,
  shadowsDark,
  shadowsLight,
} from './tokens';

declare module '@mui/material/styles' {
  interface Theme {
    layout: typeof layout;
    motion: typeof motion;
    elevation: Elevation;
  }
  interface ThemeOptions {
    layout?: typeof layout;
    motion?: typeof motion;
    elevation?: Elevation;
  }
  interface TypeBackground {
    subtle: string;
    sunken: string;
    elevated: string;
  }
}

export type ThemeMode = 'light' | 'dark';

function palette(mode: ThemeMode) {
  const dark = mode === 'dark';
  return {
    mode,
    primary: {
      main: dark ? accent[400] : accent[600],
      light: dark ? accent[300] : accent[500],
      dark: dark ? accent[500] : accent[700],
      contrastText: dark ? neutral[950] : neutral[0],
    },
    secondary: { main: dark ? neutral[300] : neutral[600] },
    success: { main: dark ? semantic.success.dark : semantic.success.light },
    warning: { main: dark ? semantic.warning.dark : semantic.warning.light },
    error: { main: dark ? semantic.danger.dark : semantic.danger.light },
    info: { main: dark ? semantic.info.dark : semantic.info.light },
    background: {
      // The page is one step down from its cards, so cards read as lifted
      // without needing a heavy shadow to say so.
      default: dark ? neutral[950] : neutral[50],
      paper: dark ? neutral[900] : neutral[0],
      subtle: dark ? neutral[850] : neutral[25],
      sunken: dark ? neutral[950] : neutral[100],
      elevated: dark ? neutral[850] : neutral[0],
    },
    text: {
      primary: dark ? neutral[100] : neutral[900],
      secondary: dark ? neutral[400] : neutral[500],
      disabled: dark ? neutral[600] : neutral[400],
    },
    divider: dark ? alpha(neutral[400], 0.16) : neutral[200],
    action: {
      hover: dark ? alpha(neutral[0], 0.05) : alpha(neutral[900], 0.035),
      selected: dark ? alpha(accent[400], 0.14) : alpha(accent[600], 0.08),
      focus: dark ? alpha(accent[400], 0.2) : alpha(accent[600], 0.12),
      disabledOpacity: 0.45,
    },
  } as const;
}

export function buildTheme(mode: ThemeMode): Theme {
  const dark = mode === 'dark';
  const shadow = dark ? shadowsDark : shadowsLight;
  const p = palette(mode);

  const base = createTheme({
    cssVariables: { colorSchemeSelector: 'class' },
    palette: p,
    layout,
    motion,
    elevation: shadow,
    spacing: SPACING_UNIT,
    shape: { borderRadius: radius.md },
    typography: {
      fontFamily: fontStack,
      // Tight tracking on large text, loose on small: the optical correction
      // that makes a type scale look drawn rather than scaled.
      h1: { fontSize: '1.875rem', fontWeight: 650, letterSpacing: '-0.022em', lineHeight: 1.2 },
      h2: { fontSize: '1.5rem', fontWeight: 650, letterSpacing: '-0.019em', lineHeight: 1.25 },
      h3: { fontSize: '1.25rem', fontWeight: 620, letterSpacing: '-0.015em', lineHeight: 1.3 },
      h4: { fontSize: '1.0625rem', fontWeight: 620, letterSpacing: '-0.01em', lineHeight: 1.4 },
      h5: { fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.006em', lineHeight: 1.45 },
      h6: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0', lineHeight: 1.45 },
      subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 560, lineHeight: 1.5 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      caption: { fontSize: '0.78125rem', lineHeight: 1.45, letterSpacing: '0.004em' },
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 620,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
      },
      button: { fontSize: '0.875rem', fontWeight: 560, letterSpacing: '0', textTransform: 'none' },
    },
    shadows: [
      'none',
      shadow.xs,
      shadow.sm,
      shadow.sm,
      shadow.md,
      shadow.md,
      shadow.md,
      shadow.lg,
      shadow.lg,
      shadow.lg,
      shadow.lg,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
      shadow.xl,
    ],
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
  });

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': { boxSizing: 'border-box' },
          html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
          body: {
            backgroundColor: base.palette.background.default,
            // Keeps the scrollbar from shifting layout when a page grows.
            scrollbarGutter: 'stable',
          },
          // Honour the operating system's reduced-motion preference globally,
          // rather than leaving each animated component to remember.
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          ':focus-visible': {
            outline: `2px solid ${base.palette.primary.main}`,
            outlineOffset: 2,
          },
          '::selection': { backgroundColor: alpha(base.palette.primary.main, 0.22) },
          '.tabular': { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' },
          '.mono': { fontFamily: monoStack, fontVariantNumeric: 'tabular-nums' },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            paddingInline: 14,
            minHeight: 36,
            transition: `background-color ${motion.fast}ms ${motion.easeOut}, border-color ${motion.fast}ms ${motion.easeOut}, transform ${motion.instant}ms ${motion.easeOut}`,
            '&:active': { transform: 'scale(0.985)' },
          },
          sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: '0.8125rem' },
          sizeLarge: { minHeight: 44, paddingInline: 20, fontSize: '0.9375rem' },
          containedPrimary: { '&:hover': { backgroundColor: dark ? accent[300] : accent[700] } },
          outlined: {
            borderColor: base.palette.divider,
            '&:hover': {
              borderColor: dark ? neutral[600] : neutral[300],
              backgroundColor: base.palette.action.hover,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            transition: `background-color ${motion.fast}ms ${motion.easeOut}`,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: base.palette.divider },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0, variant: 'outlined' },
        styleOverrides: {
          root: {
            borderRadius: radius.lg,
            borderColor: base.palette.divider,
            backgroundColor: base.palette.background.paper,
          },
        },
      },
      MuiCardContent: {
        styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
      },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            backgroundColor: dark ? alpha(neutral[0], 0.03) : base.palette.background.paper,
            transition: `box-shadow ${motion.fast}ms ${motion.easeOut}, border-color ${motion.fast}ms ${motion.easeOut}`,
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(base.palette.primary.main, dark ? 0.26 : 0.16)}`,
            },
          },
          notchedOutline: { borderColor: base.palette.divider },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '0.875rem' } } },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, fontSize: '0.78125rem' } } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radius.sm, fontWeight: 540, fontSize: '0.78125rem', height: 24 },
          sizeSmall: { height: 20, fontSize: '0.75rem' },
          label: { paddingInline: 8 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true, enterDelay: 400, enterNextDelay: 200 },
        styleOverrides: {
          tooltip: {
            backgroundColor: dark ? neutral[700] : neutral[800],
            fontSize: '0.78125rem',
            borderRadius: radius.sm,
            paddingBlock: 6,
            paddingInline: 10,
          },
          arrow: { color: dark ? neutral[700] : neutral[800] },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: radius.xl, backgroundImage: 'none', boxShadow: shadow.xl },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: '1.0625rem', fontWeight: 620, padding: '20px 24px 8px' } },
      },
      MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 20px', gap: 8 } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none', borderColor: base.palette.divider } } },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: radius.lg,
            border: `1px solid ${base.palette.divider}`,
            boxShadow: shadow.lg,
            marginTop: 4,
            minWidth: 180,
          },
          list: { padding: 6 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { borderRadius: radius.sm, fontSize: '0.875rem', minHeight: 34, gap: 10 },
        },
      },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 0, color: 'inherit' } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: base.palette.divider, fontSize: '0.875rem' },
          head: {
            fontWeight: 580,
            fontSize: '0.78125rem',
            color: base.palette.text.secondary,
            backgroundColor: base.palette.background.subtle,
            whiteSpace: 'nowrap',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40 },
          indicator: { height: 2, borderRadius: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            padding: '8px 12px',
            fontSize: '0.875rem',
            fontWeight: 540,
            textTransform: 'none',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: radius.md, fontSize: '0.875rem', alignItems: 'center' },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { backgroundColor: dark ? neutral[850] : neutral[100] } },
      },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: radius.pill, height: 6 } } },
      MuiAvatar: { styleOverrides: { root: { fontSize: '0.8125rem', fontWeight: 600 } } },
      MuiBackdrop: {
        styleOverrides: { root: { backgroundColor: alpha(neutral[950], dark ? 0.7 : 0.45) } },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: base.palette.divider } } },
    },
  });
}
