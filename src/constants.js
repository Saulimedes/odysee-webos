// Keyboard codes for WebOS TV remote
export const KEYCODE_WEBOS_BACK = '461';
export const KEYCODE_ENTER = '13';
export const KEYCODE_ESCAPE = '27';
export const KEYCODE_LEFT = '37';
export const KEYCODE_UP = '38';
export const KEYCODE_RIGHT = '39';
export const KEYCODE_DOWN = '40';

// Media control keys
export const KEYCODE_PLAY = '415';
export const KEYCODE_PAUSE = '19';
export const KEYCODE_STOP = '413';
export const KEYCODE_REWIND = '412';
export const KEYCODE_FAST_FORWARD = '417';
export const KEYCODE_PLAY_PAUSE = '10252';
export const KEYCODE_MEDIA_PLAY_PAUSE = '179';

// LG Color buttons
export const KEYCODE_RED = '403';
export const KEYCODE_GREEN = '404';
export const KEYCODE_YELLOW = '405';
export const KEYCODE_BLUE = '406';

// UI Layout
export const VIDEOS_PER_ROW = 4;
export const VIDEOS_PER_PAGE = 20;

// API Endpoints
export const LBRY_API_URL = 'https://api.lbry.tv/api/v1/proxy';
export const LIGHTHOUSE_URL = 'https://lighthouse.lbry.com/search';
export const LBRY_CDN_URL = 'https://cdn.lbryplayer.xyz';
export const THUMBNAIL_CDN_URL = 'https://thumbnails.lbry.com';
export const ODYSEE_CONTENT_API_URL = 'https://odysee.com/$/api/content/v2/get';

// Categories configuration matching Odysee/Roku structure
export const CATEGORIES = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'cheese', label: 'Cheese', icon: 'mood-happy', tags: ['comedy', 'funny', 'memes'] },
  { id: 'big-hits', label: 'Big Hits', icon: 'flame', tags: ['music', 'entertainment'] },
  { id: 'gaming', label: 'Gaming', icon: 'device-gamepad-2', tags: ['gaming', 'games', 'videogames'] },
  { id: 'science', label: 'Lab', icon: 'flask', tags: ['science', 'education', 'learning'] },
  { id: 'tech', label: 'Tech', icon: 'cpu', tags: ['technology', 'tech', 'computers'] },
  { id: 'news', label: 'News', icon: 'news', tags: ['news', 'politics', 'journalism'] },
  { id: 'finance', label: 'Finance', icon: 'chart-line', tags: ['finance', 'crypto', 'bitcoin', 'investing'] },
  { id: 'universe', label: 'Universe', icon: 'planet', tags: ['space', 'universe', 'astronomy', 'cosmos'] },
  { id: 'watchlist', label: 'Watchlist', icon: 'bookmark' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// Sidebar navigation structure (YouTube-like)
export const SIDEBAR_ITEMS_TOP = [
  { id: 'login', label: 'Login', icon: 'login', hideWhenLoggedIn: true },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'home', label: 'Home', icon: 'home' },
];

// Main visible categories
export const SIDEBAR_ITEMS_MAIN_CATEGORIES = [
  { id: 'cheese', label: 'Cheese', icon: 'mood-happy' },
  { id: 'big-hits', label: 'Big Hits', icon: 'flame' },
  { id: 'gaming', label: 'Gaming', icon: 'device-gamepad-2' },
  { id: 'universe', label: 'Universe', icon: 'planet' },
];

// More categories (shown in submenu)
export const SIDEBAR_ITEMS_MORE_CATEGORIES = [
  { id: 'science', label: 'Lab', icon: 'flask' },
  { id: 'tech', label: 'Tech', icon: 'cpu' },
  { id: 'news', label: 'News', icon: 'news' },
  { id: 'finance', label: 'Finance', icon: 'chart-line' },
];

// Library and user items
export const SIDEBAR_ITEMS_USER = [
  { id: 'library', label: 'Library', icon: 'folder' },
  { id: 'following', label: 'Following', icon: 'heart', requiresLogin: true },
  { id: 'categories', label: 'Categories', icon: 'category' },
];

// Settings at bottom
export const SIDEBAR_ITEMS_BOTTOM = [
  { id: 'more', label: 'More', icon: 'dots' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// Legacy export for backwards compatibility
export const SIDEBAR_ITEMS = [
  ...SIDEBAR_ITEMS_TOP,
  ...SIDEBAR_ITEMS_MAIN_CATEGORIES,
  ...SIDEBAR_ITEMS_BOTTOM,
];

// Content filtering - excluded tags for safe content
export const EXCLUDED_TAGS = [
  'porn', 'porno', 'nsfw', 'mature', 'xxx', 'sex', 'hentai'
];

// Storage keys
export const STORAGE_KEYS = {
  WATCHLIST: 'odysee-watchlist',
  WATCH_LATER: 'odysee-watch-later',
  FAVORITES: 'odysee-favorites',
  PLAYLISTS: 'odysee-playlists',
  WATCH_HISTORY: 'odysee-watch-history',
  SEARCH_HISTORY: 'odysee-search-history',
  SETTINGS: 'odysee-settings',
  AUTH: 'odysee-auth',
};
