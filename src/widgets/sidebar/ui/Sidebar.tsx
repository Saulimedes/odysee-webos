import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconHome, IconSearch, IconSettings, IconLogin, IconHeart, IconFolder, IconBulb, IconStar, IconPlaylist, IconCategory,
} from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { useKeys, PRIORITY } from '@/shared/lib';
import { Avatar } from '@/shared/ui';
import { useSession } from '@/entities/session';

const ICONS = {
  login: IconLogin, search: IconSearch, home: IconHome, discover: IconBulb, featured: IconStar, categories: IconCategory,
  playlists: IconPlaylist, following: IconHeart, library: IconFolder, settings: IconSettings,
};

interface Item { id: keyof typeof ICONS; label: string }

interface Props {
  selected: string;
  focused: boolean;
  onSelect: (id: string) => void;
  onLeave: () => void;
}

export function Sidebar({ selected, focused, onSelect, onLeave }: Props) {
  const { user } = useSession();
  const [index, setIndex] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const groups = useMemo<Item[][]>(() => {
    const top: Item[] = [];
    if (!user) top.push({ id: 'login', label: 'Login' });
    top.push({ id: 'search', label: 'Search' }, { id: 'home', label: 'Home' }, { id: 'discover', label: 'Discover' }, { id: 'featured', label: 'Featured' }, { id: 'categories', label: 'Categories' });
    const middle: Item[] = user ? [{ id: 'playlists', label: 'Playlists' }, { id: 'following', label: 'Following' }] : [];
    const bottom: Item[] = [{ id: 'library', label: 'Library' }, { id: 'settings', label: 'Settings' }];
    return [top, middle, bottom].filter((group) => group.length > 0);
  }, [user]);
  const items = useMemo(() => groups.flat(), [groups]);

  useEffect(() => {
    const at = items.findIndex((item) => item.id === selected);
    setIndex(at >= 0 ? at : 0);
  }, [items, selected]);

  useEffect(() => {
    if (focused) refs.current[index]?.scrollIntoView({ block: 'nearest' });
  }, [focused, index]);

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => Math.max(0, current - 1)); return true;
      case KEY.DOWN: setIndex((current) => Math.min(items.length - 1, current + 1)); return true;
      case KEY.RIGHT: onLeave(); return true;
      case KEY.ENTER: onSelect(items[index].id); return true;
      default: return false;
    }
  }, { enabled: focused, priority: PRIORITY.sidebar });

  let flat = 0;
  return (
    <nav className={`sidebar${focused ? ' sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        {user?.profile_image ? <Avatar src={user.profile_image} name={user.channel?.name || 'U'} size={52} /> : <img src="icon.png" alt="" width={52} height={52} />}
        <span className="sidebar__label sidebar__brandName">{user?.channel?.name ? `@${user.channel.name}` : 'Odysee'}</span>
      </div>
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className={`sidebar__group${groupIndex === groups.length - 1 ? ' sidebar__group--bottom' : ''}`}>
          {group.map((item) => {
            const position = flat++;
            const Icon = ICONS[item.id];
            const active = focused && position === index;
            return (
              <div
                key={item.id}
                ref={(element) => { refs.current[position] = element; }}
                className={`sidebar__item${selected === item.id ? ' sidebar__item--selected' : ''}${active ? ' sidebar__item--active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={40} stroke={1.5} />
                <span className="sidebar__label">{item.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
