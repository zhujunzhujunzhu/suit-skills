import type { AppSettings } from '../api/client';

export const DEFAULT_THEME_COLOR = '#b7e05a';

export type ThemeVariableMap = Record<string, string>;
export type ThemeDraft = Pick<AppSettings, 'themeMode' | 'themeColor'>;

export const CLASSIC_THEME_VARIABLES: ThemeVariableMap = {
  '--surface': '#121411',
  '--surface-lowest': '#0d0f0c',
  '--surface-low': '#1a1d18',
  '--surface-mid': '#22251f',
  '--surface-high': '#2d3129',
  '--surface-bright': '#3b4035',
  '--surface-hover': 'rgba(183, 224, 90, 0.1)',
  '--text': '#ece9dc',
  '--foreground': '#ece9dc',
  '--muted': '#c9c5b3',
  '--text-secondary': '#a6a18f',
  '--faint': '#898574',
  '--outline': 'rgba(120, 126, 99, 0.42)',
  '--outline-soft': 'rgba(120, 126, 99, 0.2)',
  '--primary': '#b7e05a',
  '--primary-strong': '#7ea32b',
  '--primary-ink': '#161d0b',
  '--secondary': '#efbd67',
  '--tertiary': '#e9907b',
  '--accent': '#b7e05a',
  '--accent-muted': 'rgba(183, 224, 90, 0.18)',
  '--warning': '#efbd67',
  '--error': '#ff9d88',
  '--danger': '#ff9d88',
  '--shadow-soft': '0 18px 42px rgba(3, 10, 8, 0.22)',
  '--shadow-strong': '0 28px 90px rgba(2, 8, 6, 0.3)',
  '--panel-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(
  value: string | undefined,
  fallback = DEFAULT_THEME_COLOR,
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return fallback;
  const hex = match[1].toLowerCase();
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }
  return `#${hex}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(colorA: string, colorB: string, weightB: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const weight = clamp(weightB, 0, 1);
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  });
}

function toRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function rgbToHsl({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return {
    h: ((h * 60) + 360) % 360,
    s: s * 100,
    l: l * 100,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return rgbToHex({
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  });
}

export function buildCustomThemeVariables(themeColor: string): ThemeVariableMap {
  const primary = normalizeHexColor(themeColor);
  const primaryRgb = hexToRgb(primary);
  const { h, s, l } = rgbToHsl(primaryRgb);
  const surfaceBaseS = clamp(8 + s * 0.18, 8, 18);
  const surface = hslToHex(h, surfaceBaseS, 8);
  const surfaceLowest = hslToHex(h, surfaceBaseS * 0.9, 5);
  const surfaceLow = hslToHex(h, surfaceBaseS, 10);
  const surfaceMid = hslToHex(h, surfaceBaseS + 1, 15);
  const surfaceHigh = hslToHex(h, surfaceBaseS + 2, 21);
  const surfaceBright = hslToHex(h, surfaceBaseS + 3, 29);
  const text = hslToHex(h, clamp(6 + s * 0.08, 6, 16), 93);
  const muted = hslToHex(h, clamp(8 + s * 0.1, 8, 18), 78);
  const textSecondary = hslToHex(h, clamp(7 + s * 0.08, 7, 16), 65);
  const faint = hslToHex(h, clamp(6 + s * 0.07, 6, 14), 53);
  const primaryStrong = hslToHex(
    h,
    clamp(28 + s * 0.28, 28, 72),
    clamp(l * 0.72, 28, 45),
  );
  const primaryInk = hslToHex(h, clamp(12 + s * 0.18, 12, 28), 10);
  const secondary = hslToHex(
    h + 34,
    clamp(26 + s * 0.34, 26, 70),
    clamp(Math.max(l, 62), 62, 72),
  );
  const tertiary = hslToHex(
    h - 24,
    clamp(30 + s * 0.38, 30, 74),
    clamp(Math.max(l, 64), 64, 74),
  );
  const accent = hslToHex(
    h + 10,
    clamp(24 + s * 0.36, 24, 72),
    clamp(Math.max(l, 60), 60, 72),
  );
  const outlineBase = mixHex(primary, text, 0.34);
  const shadowColor = mixHex(surfaceLowest, primaryStrong, 0.2);

  return {
    '--surface': surface,
    '--surface-lowest': surfaceLowest,
    '--surface-low': surfaceLow,
    '--surface-mid': surfaceMid,
    '--surface-high': surfaceHigh,
    '--surface-bright': surfaceBright,
    '--surface-hover': toRgba(primary, 0.1),
    '--text': text,
    '--foreground': text,
    '--muted': muted,
    '--text-secondary': textSecondary,
    '--faint': faint,
    '--outline': toRgba(outlineBase, 0.34),
    '--outline-soft': toRgba(outlineBase, 0.18),
    '--primary': primary,
    '--primary-strong': primaryStrong,
    '--primary-ink': primaryInk,
    '--secondary': secondary,
    '--tertiary': tertiary,
    '--accent': accent,
    '--accent-muted': toRgba(accent, 0.18),
    '--warning': secondary,
    '--error': tertiary,
    '--danger': tertiary,
    '--shadow-soft': `0 18px 42px ${toRgba(shadowColor, 0.24)}`,
    '--shadow-strong': `0 28px 90px ${toRgba(shadowColor, 0.34)}`,
    '--panel-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  };
}

export function buildThemePreviewVariables(theme: ThemeDraft): ThemeVariableMap {
  return theme.themeMode === 'custom'
    ? buildCustomThemeVariables(theme.themeColor)
    : CLASSIC_THEME_VARIABLES;
}

export const THEME_VARIABLE_NAMES = Object.keys(CLASSIC_THEME_VARIABLES);
