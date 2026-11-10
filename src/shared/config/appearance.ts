import type { Settings, SettingKey } from './settings';
import { SETTING_DEFAULTS, SYSTEM_FONT_STACK, UI_FONTS, CORNER_STYLES, STORAGE } from './constants';
import { getSetting, subscribeSettings } from './settings';

interface RGB { r: number; g: number; b: number }
interface Palette { bg: string; surface: string; surfaceAlt: string; surfaceHover: string; text: string; muted: string; dim: string; border: string; panel?: string; panelAlt?: string }

const APPEARANCE_SETTINGS: SettingKey[] = ['themeMode', 'accentColor', 'uiFont', 'cornerStyle', 'textScale', 'tileScale', 'iconVariant'];

const PALETTES: Record<string, Palette> = {
  black: { bg: '#000000', surface: '#17171a', surfaceAlt: '#0e0e11', surfaceHover: '#212126', text: '#ffffff', muted: '#909296', dim: '#666666', border: '#2a2a30' },
  dark: { bg: '#141517', surface: '#25262b', surfaceAlt: '#1a1b1e', surfaceHover: '#2c2e33', text: '#ffffff', muted: '#909296', dim: '#666666', border: '#373a40' },
  light: { bg: '#f4f5f7', surface: '#ffffff', surfaceAlt: '#e6e8ec', surfaceHover: '#e0e3e8', text: '#1a1b1e', muted: '#5c5f66', dim: '#868e96', border: '#ced4da' },
};

const hexToRgb = (hex: string): RGB => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) } : { r: 222, g: 0, b: 80 };
};

const rgbToHsl = ({ r, g, b }: RGB) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};

const hslToRgb = (h: number, s: number, l: number): RGB => {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue(p, q, h + 1 / 3) * 255),
    g: Math.round(hue(p, q, h) * 255),
    b: Math.round(hue(p, q, h - 1 / 3) * 255),
  };
};

const toHex = ({ r, g, b }: RGB) => `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
const rgbString = ({ r, g, b }: RGB) => `${r}, ${g}, ${b}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const luminance = ({ r, g, b }: RGB) => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const isLightTheme = (themeMode: string) => themeMode === 'light' || themeMode === 'lighttinted';

function accentVars(accentColor: string, isLight: boolean) {
  const rgb = hexToRgb(accentColor);
  const { h, s, l } = rgbToHsl(rgb);
  const textLightness = isLight ? Math.min(l, 38) : Math.max(l, 48);
  return {
    '--accent': toHex(rgb),
    '--accent-rgb': rgbString(rgb),
    '--accent-contrast': luminance(rgb) > 0.4 ? '#000000' : '#ffffff',
    '--accent-text': toHex(hslToRgb(h, s, textLightness)),
  };
}

function tonePalette(accentColor: string, spec: { satScale: number; satMin: number; satMax: number; bg: number; surface: number; surfaceAlt: number; hover: number; border: number; muted: number; dim: number; light?: boolean }): Palette {
  const { h, s } = rgbToHsl(hexToRgb(accentColor));
  const saturation = s < 8 ? 0 : clamp(s * spec.satScale, spec.satMin, spec.satMax);
  const tone = (lightness: number, sat = saturation) => toHex(hslToRgb(h, sat, lightness));
  return {
    bg: tone(spec.bg),
    surface: tone(spec.surface),
    surfaceAlt: tone(spec.surfaceAlt),
    surfaceHover: tone(spec.hover),
    border: tone(spec.border),
    text: spec.light ? tone(11, Math.min(saturation, 24)) : '#ffffff',
    muted: tone(spec.muted, Math.min(saturation, spec.light ? 18 : 22)),
    dim: tone(spec.dim, Math.min(saturation, 14)),
  };
}

const AMBIENT: Palette = {
  bg: '#0b0b0d', surface: 'rgba(255, 255, 255, 0.07)', surfaceAlt: 'rgba(255, 255, 255, 0.045)', surfaceHover: 'rgba(255, 255, 255, 0.14)', border: 'rgba(255, 255, 255, 0.12)',
  text: '#ffffff', muted: 'rgba(255, 255, 255, 0.7)', dim: 'rgba(255, 255, 255, 0.5)', panel: '#18181b', panelAlt: '#101012',
};

export const paletteFor = (themeMode: string, accentColor: string): Palette => {
  if (themeMode === 'tinted') return tonePalette(accentColor, { satScale: 0.6, satMin: 30, satMax: 54, bg: 10, surface: 20, surfaceAlt: 15, hover: 27, border: 32, muted: 70, dim: 50 });
  if (themeMode === 'ambient') return AMBIENT;
  if (themeMode === 'lighttinted') return tonePalette(accentColor, { satScale: 0.55, satMin: 26, satMax: 58, bg: 94, surface: 98, surfaceAlt: 90, hover: 86, border: 78, muted: 36, dim: 52, light: true });
  return PALETTES[themeMode] || PALETTES.black;
};

function paletteVars(palette: Palette) {
  return {
    '--bg': palette.bg,
    '--bg-rgb': rgbString(hexToRgb(palette.bg)),
    '--text-rgb': rgbString(hexToRgb(palette.text)),
    '--surface': palette.surface,
    '--surface-alt': palette.surfaceAlt,
    '--panel': palette.panel ?? palette.surface,
    '--panel-alt': palette.panelAlt ?? palette.surfaceAlt,
    '--surface-hover': palette.surfaceHover,
    '--text': palette.text,
    '--text-muted': palette.muted,
    '--text-dim': palette.dim,
    '--border-color': palette.border,
  };
}

const fontStack = (code: string) => {
  const font = UI_FONTS.find((f) => f.code === code);
  return font && font.family ? `'${font.family}', ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK;
};

export function computeAppearance(settings: Pick<Settings, 'themeMode' | 'accentColor' | 'uiFont' | 'cornerStyle' | 'textScale' | 'tileScale'> & Partial<Pick<Settings, 'iconVariant'>>): { attrs: Record<string, string>; vars: Record<string, string> } {
  const { themeMode, accentColor, uiFont, cornerStyle, textScale, tileScale, iconVariant = 'outlined' } = settings;
  const palette = paletteFor(themeMode, accentColor);
  const accent = accentVars(accentColor, isLightTheme(themeMode));
  const radii = (CORNER_STYLES.find((corner) => corner.code === cornerStyle) || CORNER_STYLES[1]).radii;
  return {
    attrs: { 'data-theme': themeMode, 'data-icons': iconVariant, 'data-contrast': accent['--accent-contrast'] === '#000000' ? 'dark' : 'light' },
    vars: {
      ...accent,
      ...paletteVars(palette),
      '--radius-sm': `${radii[0]}px`,
      '--radius-md': `${radii[1]}px`,
      '--radius-lg': `${radii[2]}px`,
      '--radius-xl': `${radii[3]}px`,
      '--ui-font': fontStack(uiFont),
      '--text-scale': String(textScale),
      '--tile-scale': String(tileScale),
    },
  };
}

export function applyAppearance() {
  const appearance = computeAppearance(Object.fromEntries(
    (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => [key, getSetting(key)])
  ) as Settings);

  const root = document.documentElement;
  Object.keys(appearance.attrs).forEach((name) => root.setAttribute(name, appearance.attrs[name]));
  Object.keys(appearance.vars).forEach((name) => root.style.setProperty(name, appearance.vars[name]));

  try {
    localStorage.setItem(STORAGE.APPEARANCE_BOOT, JSON.stringify(appearance));
  } catch (error) {
    console.error('Could not cache appearance', error);
  }
}

export function initAppearance() {
  applyAppearance();
  return subscribeSettings((key) => {
    if (APPEARANCE_SETTINGS.includes(key)) applyAppearance();
  });
}
