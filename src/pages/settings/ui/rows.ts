import { IconArrowLeft, IconAspectRatio, IconBadgeHd, IconBorderCorners, IconBug, IconCircleDot, IconColorSwatch, IconGauge, IconHistory, IconHome, IconIcons, IconInfoCircle, IconLanguage, IconLayoutDashboard, IconLayoutGrid, IconLayoutSidebar, IconLoader2, IconMoonStars, IconPalette, IconPlayerPlay, IconPlayerSkipForward, IconShieldHalf, IconTextSize, IconTrash, IconTypography, IconUser, IconWorld, IconZoomIn, type Icon } from '@tabler/icons-react';
import {
  ACCENT_COLORS, ASPECT_RATIOS, CORNER_STYLES, HOMEPAGE_LANGUAGES, ICON_SCALES, ICON_VARIANTS, LOADER_STYLES, LOGO_BUTTONS, PLAYBACK_SPEEDS, TEXT_SCALES, THEME_MODES, TILE_SCALES, UI_FONTS, UI_LANGUAGES, VIDEO_QUALITIES,
  type SettingKey,
} from '@/shared/config';
import type { PickerOption } from '@/shared/ui';
import type { LayoutKind } from '@/features/customize-layout';

export type ChoiceVariant = 'swatch' | 'font' | 'theme' | 'loader';

export type SettingsRow =
  | { id: string; kind: 'account' }
  | { id: string; Icon: Icon; kind: 'toggle'; key: 'autoplay' | 'resume' | 'nsfw' | 'statsForNerds' | 'osdBackButton'; label: string; hint: string; section?: string; requiresLogin?: boolean }
  | { id: string; Icon: Icon; kind: 'choice'; key: SettingKey; label: string; hint: string; section?: string; options: PickerOption[]; variant?: ChoiceVariant }
  | { id: string; Icon: Icon; kind: 'editor'; editor: LayoutKind; label: string; hint: string; section?: string }
  | { id: string; Icon: Icon; kind: 'clear'; section: string }
  | { id: string; Icon: Icon; kind: 'about'; section: string };

export interface SettingsCategory {
  id: string;
  label: string;
  Icon: Icon;
  rows: SettingsRow[];
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    Icon: IconPalette,
    rows: [
      { id: 'themeMode', Icon: IconMoonStars, kind: 'choice', key: 'themeMode', label: 'Theme', hint: 'Black, Dark or Light, and tinted variants of your accent color', options: THEME_MODES, variant: 'theme' },
      { id: 'accentColor', Icon: IconColorSwatch, kind: 'choice', key: 'accentColor', label: 'Accent Color', hint: 'The highlight color used across the app, Odysee Pink by default', options: ACCENT_COLORS, variant: 'swatch' },
      { id: 'uiFont', Icon: IconTypography, kind: 'choice', key: 'uiFont', label: 'Font', hint: 'The font used across the app', options: UI_FONTS.map((font) => ({ code: font.code, name: font.name, family: font.family })), variant: 'font' },
      { id: 'loaderStyle', Icon: IconLoader2, kind: 'choice', key: 'loaderStyle', label: 'Loading Animation', hint: 'Shown whenever a page or the player is loading. The ring is the lightest on older TVs', options: LOADER_STYLES, variant: 'loader' },
      { id: 'cornerStyle', Icon: IconBorderCorners, kind: 'choice', key: 'cornerStyle', label: 'Corners', hint: 'How round the cards and buttons are', options: CORNER_STYLES },
      { id: 'textScale', Icon: IconTextSize, kind: 'choice', key: 'textScale', label: 'Text Size', hint: 'Scales all text in the app', options: TEXT_SCALES },
      { id: 'tileScale', Icon: IconLayoutGrid, kind: 'choice', key: 'tileScale', label: 'Card Size', hint: 'Scales the video cards', options: TILE_SCALES },
    ],
  },
  {
    id: 'customize',
    label: 'Customize',
    Icon: IconLayoutDashboard,
    rows: [
      { id: 'customizeHome', Icon: IconHome, kind: 'editor', editor: 'home', label: 'Customize Homepage', hint: 'Choose which rows Home shows and in which order' },
      { id: 'customizeSidebar', Icon: IconLayoutSidebar, kind: 'editor', editor: 'sidebar', label: 'Customize Sidebar', hint: 'Choose which menu entries show and in which order' },
      { id: 'logoButton', Icon: IconCircleDot, kind: 'choice', key: 'logoButton', label: 'Logo Button', hint: 'The Odysee logo can be the button for Home or for Settings. It then replaces that entry in the menu, so it is never both', options: LOGO_BUTTONS },
      { id: 'iconVariant', Icon: IconIcons, kind: 'choice', key: 'iconVariant', label: 'Menu Icon Style', hint: 'Dynamic fills the icon of the entry you are on or focus', options: ICON_VARIANTS },
      { id: 'iconScale', Icon: IconZoomIn, kind: 'choice', key: 'iconScale', label: 'Menu Icon Size', hint: 'Scales the icons of the sidebar', options: ICON_SCALES },
    ],
  },
  {
    id: 'language',
    label: 'Language',
    Icon: IconLanguage,
    rows: [
      { id: 'uiLanguage', Icon: IconLanguage, kind: 'choice', key: 'uiLanguage', label: 'App Language', hint: 'Language of menus and settings. Auto follows the language of your TV', options: UI_LANGUAGES },
      { id: 'homepageLanguage', Icon: IconWorld, kind: 'choice', key: 'homepageLanguage', label: 'Homepage Language', hint: 'Odysee has a homepage with its own rows for these languages', options: HOMEPAGE_LANGUAGES },
    ],
  },
  {
    id: 'playback',
    label: 'Playback',
    Icon: IconPlayerPlay,
    rows: [
      { id: 'autoplay', Icon: IconPlayerSkipForward, kind: 'toggle', key: 'autoplay', label: 'Autoplay next video', hint: 'Play the next video of the channel when one ends' },
      { id: 'resume', Icon: IconHistory, kind: 'toggle', key: 'resume', label: 'Resume playback', hint: 'Continue where you stopped, and keep the Continue Watching row' },
      { id: 'quality', Icon: IconBadgeHd, kind: 'choice', key: 'quality', label: 'Video Quality', hint: 'Auto uses the original file', options: VIDEO_QUALITIES.map((quality) => ({ code: quality.code, name: quality.name })) },
      { id: 'aspectRatio', Icon: IconAspectRatio, kind: 'choice', key: 'aspectRatio', label: 'Aspect Ratio', hint: 'How video fills the screen. You can change it in the player too', options: ASPECT_RATIOS.map((aspect) => ({ code: aspect.code, name: aspect.name })) },
      { id: 'playbackSpeed', Icon: IconGauge, kind: 'choice', key: 'playbackSpeed', label: 'Playback Speed', hint: 'The speed videos start with. You can change it in the player too', options: PLAYBACK_SPEEDS },
      { id: 'osdBackButton', Icon: IconArrowLeft, kind: 'toggle', key: 'osdBackButton', label: 'Back Button', hint: 'Shows a back arrow at the top left of the player controls. The Back key of the remote works either way' },
      { id: 'statsForNerds', Icon: IconBug, kind: 'toggle', key: 'statsForNerds', label: 'Stats for Nerds', hint: 'Adds Stats for Nerds to the player settings, with details such as the stream, resolution, buffer and connection' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    Icon: IconUser,
    rows: [
      { id: 'account', kind: 'account' },
      { id: 'nsfw', Icon: IconShieldHalf, kind: 'toggle', key: 'nsfw', section: 'Content', label: 'Show mature content', hint: 'Include mature videos in feeds and search', requiresLogin: true },
      { id: 'clear', Icon: IconTrash, kind: 'clear', section: 'Storage' },
    ],
  },
  {
    id: 'about',
    label: 'About',
    Icon: IconInfoCircle,
    rows: [{ id: 'about', Icon: IconInfoCircle, kind: 'about', section: 'About' }],
  },
];
