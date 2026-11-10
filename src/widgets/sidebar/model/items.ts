import {
  IconBulb, IconBulbFilled, IconCategory, IconCategoryFilled, IconFolder, IconFolderFilled, IconHeart, IconHeartFilled, IconHome, IconHomeFilled,
  IconLogin, IconPlaylist, IconPlaylistFilled, IconSearch, IconSearchFilled, IconSettings, IconSettingsFilled, IconStar, IconStarFilled,
  type Icon,
} from '@tabler/icons-react';

export type SidebarGroup = 'main' | 'account' | 'bottom';

export interface SidebarItem {
  id: string;
  label: string;
  group: SidebarGroup;
  Icon: Icon;
  Filled?: Icon;
  account?: boolean;
  locked?: boolean;
}

export const LOGIN_ITEM: SidebarItem = { id: 'login', label: 'Login', group: 'main', Icon: IconLogin };

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'search', label: 'Search', group: 'main', Icon: IconSearch, Filled: IconSearchFilled },
  { id: 'home', label: 'Home', group: 'main', Icon: IconHome, Filled: IconHomeFilled },
  { id: 'discover', label: 'Discover', group: 'main', Icon: IconBulb, Filled: IconBulbFilled },
  { id: 'featured', label: 'Featured', group: 'main', Icon: IconStar, Filled: IconStarFilled },
  { id: 'categories', label: 'Categories', group: 'main', Icon: IconCategory, Filled: IconCategoryFilled },
  { id: 'playlists', label: 'Playlists', group: 'account', Icon: IconPlaylist, Filled: IconPlaylistFilled, account: true },
  { id: 'following', label: 'Following', group: 'account', Icon: IconHeart, Filled: IconHeartFilled, account: true },
  { id: 'library', label: 'Library', group: 'account', Icon: IconFolder, Filled: IconFolderFilled },
  { id: 'settings', label: 'Settings', group: 'bottom', Icon: IconSettings, Filled: IconSettingsFilled, locked: true },
];

export const LOCKED_ITEMS = [LOGIN_ITEM.id, ...SIDEBAR_ITEMS.filter((item) => item.locked).map((item) => item.id)];

function groupItems(items: SidebarItem[]): SidebarItem[][] {
  const blocks: SidebarItem[][] = [];
  items.forEach((item) => {
    const last = blocks[blocks.length - 1];
    if (last && last[0].group === item.group) last.push(item);
    else blocks.push([item]);
  });
  return blocks;
}

export function splitBlocks(items: SidebarItem[]): { middle: SidebarItem[][]; bottom: SidebarItem[] } {
  const blocks = groupItems(items);
  return { middle: blocks.filter((block) => block[0].group !== 'bottom'), bottom: blocks.filter((block) => block[0].group === 'bottom').flat() };
}
