export const KEY = {
  BACKSPACE: 8,
  ENTER: 13,
  ESCAPE: 27,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  PAUSE: 19,
  WEBOS_BACK: 461,
  PLAY: 415,
  STOP: 413,
  REWIND: 412,
  FAST_FORWARD: 417,
  PLAY_PAUSE: 10252,
  MEDIA_PLAY_PAUSE: 179,
} as const;

export const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const LBRY_API_URL = 'https://api.lbry.tv/api/v1/proxy';
export const ODYSEE_PROXY_URL = IS_DEV ? '/odysee-proxy/api/v1/proxy' : 'https://api.na-backend.odysee.com/api/v1/proxy';
export const LBRY_COM_URL = IS_DEV ? '/lbry-api-com' : 'https://api.lbry.com';
export const ODYSEE_API_URL = 'https://api.odysee.com';
export const LIGHTHOUSE_URL = 'https://lighthouse.lbry.com/search';
export const LBRY_CDN_URL = 'https://cdn.lbryplayer.xyz';
export const CONTENT_API_URL = 'https://odysee.com/$/api/content/v2/get';
export const THUMBNAIL_OPTIMIZER_URL = 'https://thumbnails.odycdn.com/optimize';

export const EXCLUDED_TAGS = ['porn', 'porno', 'nsfw', 'mature', 'xxx', 'sex', 'hentai'];

export const STORAGE = {
  AUTH: 'odysee-auth',
  WATCH_LATER: 'odysee-watch-later',
  FAVORITES: 'odysee-favorites',
  WATCH_HISTORY: 'odysee-watch-history',
  CONTINUE_WATCHING: 'continue_watching',
  LEGACY_SETTINGS: 'odysee-settings',
  APPEARANCE_BOOT: 'appearance_boot',
} as const;

export const THEME_MODES = [
  { code: 'black', name: 'Black' },
  { code: 'dark', name: 'Dark' },
  { code: 'light', name: 'Light' },
  { code: 'tinted', name: 'Tinted' },
  { code: 'ambient', name: 'Ambient Glow' },
  { code: 'lighttinted', name: 'Light Tinted' },
];

export const ACCENT_COLORS = [
  { code: '#DE0050', name: 'Odysee Pink' },
  { code: '#FF2D55', name: 'Pink' },
  { code: '#FF007F', name: 'Rose' },
  { code: '#F44336', name: 'Red' },
  { code: '#FF6F61', name: 'Coral' },
  { code: '#FF9800', name: 'Orange' },
  { code: '#FFC107', name: 'Amber' },
  { code: '#FFEB3B', name: 'Yellow' },
  { code: '#D4AF37', name: 'Gold' },
  { code: '#AAF40D', name: 'Acid Green' },
  { code: '#C6FF00', name: 'Lime' },
  { code: '#4CAF50', name: 'Green' },
  { code: '#00C853', name: 'Emerald' },
  { code: '#00C7BE', name: 'Mint' },
  { code: '#00BCD4', name: 'Cyan' },
  { code: '#03A9F4', name: 'Sky' },
  { code: '#007AFF', name: 'Blue' },
  { code: '#2962FF', name: 'Royal Blue' },
  { code: '#5856D6', name: 'Indigo' },
  { code: '#7C4DFF', name: 'Deep Purple' },
  { code: '#AF52DE', name: 'Lavender' },
  { code: '#D500F9', name: 'Magenta' },
  { code: '#9E9E9E', name: 'Silver' },
  { code: '#FFFFFF', name: 'White' },
];

export const CORNER_STYLES = [
  { code: 'square', name: 'Square', radii: [0, 0, 0, 0] },
  { code: 'classic', name: 'Classic', radii: [4, 8, 12, 16] },
  { code: 'round', name: 'Round', radii: [8, 14, 22, 30] },
];

export const SYSTEM_FONT_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const UI_FONTS = [
  { code: 'default', name: 'System', family: null },
  { code: 'inter', name: 'Inter', family: 'Inter' },
  { code: 'poppins', name: 'Poppins', family: 'Poppins' },
  { code: 'open-sans', name: 'Open Sans', family: 'Open Sans' },
  { code: 'space-grotesk', name: 'Space Grotesk', family: 'Space Grotesk' },
  { code: 'lexend', name: 'Lexend', family: 'Lexend' },
  { code: 'atkinson', name: 'Atkinson Hyperlegible Next', family: 'Atkinson Hyperlegible Next' },
  { code: 'andika', name: 'Andika', family: 'Andika' },
  { code: 'comic-neue', name: 'Comic Neue', family: 'Comic Neue' },
  { code: 'opendyslexic', name: 'OpenDyslexic', family: 'OpenDyslexic' },
  { code: 'print', name: 'Merriweather', family: 'Merriweather' },
  { code: 'typewriter', name: 'Courier Prime', family: 'Courier Prime' },
  { code: 'console', name: 'Inconsolata', family: 'Inconsolata' },
  { code: 'silkscreen', name: 'Silkscreen', family: 'Silkscreen' },
];

const scaleOption = (scale: number) => ({ code: scale, name: scale === 1 ? 'Normal (100%)' : `${Math.round(scale * 100)}%` });

export const TEXT_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map(scaleOption);
export const TILE_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3].map(scaleOption);

export const VIDEO_QUALITIES = [
  { code: 'auto', name: 'Auto', height: 0 },
  { code: '2160', name: '4K (2160p)', height: 2160 },
  { code: '1440', name: '1440p', height: 1440 },
  { code: '1080', name: '1080p', height: 1080 },
  { code: '720', name: '720p', height: 720 },
  { code: '480', name: '480p', height: 480 },
  { code: '360', name: '360p', height: 360 },
];

export const SETTING_DEFAULTS = {
  themeMode: 'black',
  accentColor: '#DE0050',
  uiFont: 'default',
  cornerStyle: 'classic',
  textScale: 1,
  tileScale: 1,
  autoplay: true,
  quality: 'auto',
  nsfw: false,
  resume: true,
};
