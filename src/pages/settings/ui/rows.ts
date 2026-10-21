import {
  ACCENT_COLORS, CORNER_STYLES, TEXT_SCALES, THEME_MODES, TILE_SCALES, UI_FONTS, VIDEO_QUALITIES,
  type SettingKey,
} from '@/shared/config';

export interface Option { code: string | number; name: string; family?: string | null }

export type SettingsRow =
  | { id: string; kind: 'account' }
  | { id: string; kind: 'toggle'; key: 'autoplay' | 'resume' | 'nsfw'; label: string; hint: string; section?: string; requiresLogin?: boolean }
  | { id: string; kind: 'choice'; key: SettingKey; label: string; hint: string; section?: string; options: Option[]; variant?: 'swatch' | 'font' }
  | { id: string; kind: 'clear'; section: string }
  | { id: string; kind: 'about'; section: string };

export const SETTINGS_ROWS: SettingsRow[] = [
  { id: 'account', kind: 'account' },
  { id: 'themeMode', kind: 'choice', key: 'themeMode', section: 'Appearance', label: 'Theme', hint: 'The background style of the app', options: THEME_MODES },
  { id: 'accentColor', kind: 'choice', key: 'accentColor', label: 'Accent Color', hint: 'The highlight color used across the app', options: ACCENT_COLORS, variant: 'swatch' },
  { id: 'uiFont', kind: 'choice', key: 'uiFont', label: 'Font', hint: 'The font used across the app', options: UI_FONTS.map((font) => ({ code: font.code, name: font.name, family: font.family })), variant: 'font' },
  { id: 'cornerStyle', kind: 'choice', key: 'cornerStyle', label: 'Corners', hint: 'How round the cards and buttons are', options: CORNER_STYLES },
  { id: 'textScale', kind: 'choice', key: 'textScale', label: 'Text Size', hint: 'Scales all text in the app', options: TEXT_SCALES },
  { id: 'tileScale', kind: 'choice', key: 'tileScale', label: 'Card Size', hint: 'Scales the video cards', options: TILE_SCALES },
  { id: 'autoplay', kind: 'toggle', key: 'autoplay', section: 'Playback', label: 'Autoplay next video', hint: 'Play the next video of the channel when one ends' },
  { id: 'resume', kind: 'toggle', key: 'resume', label: 'Resume playback', hint: 'Continue where you stopped, and keep the Continue Watching row' },
  { id: 'quality', kind: 'choice', key: 'quality', label: 'Video quality', hint: 'Auto uses the original file', options: VIDEO_QUALITIES.map((quality) => ({ code: quality.code, name: quality.name })) },
  { id: 'nsfw', kind: 'toggle', key: 'nsfw', section: 'Content', label: 'Show mature content', hint: 'Include mature videos in feeds and search', requiresLogin: true },
  { id: 'clear', kind: 'clear', section: 'Storage' },
  { id: 'about', kind: 'about', section: 'About' },
];
