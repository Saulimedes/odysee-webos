import { useEffect, useMemo, useRef, useState } from 'react';
import { KEY, useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useKeys, PRIORITY, cycle, pointerMoved } from '@/shared/lib';
import { Avatar, SquircleDefs } from '@/shared/ui';
import { useSession } from '@/entities/session';
import { useLayout, visibleItems } from '@/features/customize-layout';
import { LOCKED_ITEMS, SIDEBAR_ITEMS, splitBlocks, type SidebarItem } from '../model/items';

const BASE_ICON_SIZE = 40;
const LOGIN = 'login';

interface Props {
  selected: string;
  focused: boolean;
  onSelect: (id: string) => void;
  onLeave: () => void;
  onFocus: () => void;
}

function MenuIcon({ item, variant, lit, size }: { item: SidebarItem; variant: string; lit: boolean; size: number }) {
  const solid = variant === 'filled' || (variant === 'dynamic' && lit);
  return solid ? <item.Filled size={size} /> : <item.Icon size={size} stroke={1.5} />;
}

export function Sidebar({ selected, focused, onSelect, onLeave, onFocus }: Props) {
  const t = useTranslation();
  const { user } = useSession();
  const layout = useLayout('sidebar');
  const [iconVariant] = useSetting('iconVariant');
  const [iconScale] = useSetting('iconScale');
  const [logoButton] = useSetting('logoButton');
  const [index, setIndex] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const iconSize = Math.round(BASE_ICON_SIZE * iconScale);

  const brandId = useMemo(() => {
    if (logoButton === LOGIN) return user ? null : LOGIN;
    return SIDEBAR_ITEMS.some((item) => item.id === logoButton) ? logoButton : null;
  }, [logoButton, user]);
  const member = logoButton === LOGIN ? user : null;
  const here = selected === LOGIN && logoButton !== LOGIN ? 'settings' : selected;
  const { middle, bottom } = useMemo(() => {
    const shown = visibleItems(SIDEBAR_ITEMS.filter((item) => !item.account || user), layout, LOCKED_ITEMS).filter((item) => item.id !== brandId);
    return splitBlocks(shown);
  }, [user, layout, brandId]);
  const stops = useMemo(() => [...(brandId ? [brandId] : []), ...middle.flat().map((item) => item.id), ...bottom.map((item) => item.id)], [brandId, middle, bottom]);

  useEffect(() => {
    const at = stops.indexOf(here);
    setIndex(at >= 0 ? at : 0);
  }, [stops, here]);

  useEffect(() => {
    if (focused) refs.current[index]?.scrollIntoView({ block: 'nearest' });
  }, [focused, index]);

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => cycle(current, -1, stops.length)); return true;
      case KEY.DOWN: setIndex((current) => cycle(current, 1, stops.length)); return true;
      case KEY.RIGHT: onLeave(); return true;
      case KEY.ENTER: onSelect(stops[index]); return true;
      default: return false;
    }
  }, { enabled: focused, priority: PRIORITY.sidebar });

  let flat = brandId ? 1 : 0;
  const brandActive = brandId !== null && focused && index === 0;
  const renderItem = (item: SidebarItem) => {
    const position = flat++;
    const active = focused && position === index;
    const current = here === item.id;
    return (
      <div
        key={item.id}
        ref={(element) => { refs.current[position] = element; }}
        className={`sidebar__item${current ? ' sidebar__item--selected' : ''}${active ? ' sidebar__item--active' : ''}`}
        onClick={() => onSelect(item.id)}
        onMouseMove={(event) => { if (pointerMoved(event)) setIndex(position); }}
      >
        <MenuIcon item={item} variant={iconVariant} lit={active || current} size={iconSize} />
        <span className="sidebar__label">{t(item.label)}</span>
      </div>
    );
  };
  return (
    <nav
      className={`sidebar${focused ? ' sidebar--open' : ''}`}
      style={{ '--icon-size': `${iconSize}px` } as React.CSSProperties}
      onMouseMove={(event) => { if (!focused && pointerMoved(event)) onFocus(); }}
    >
      <div
        ref={(element) => { if (brandId) refs.current[0] = element; }}
        className={`sidebar__brand${brandId ? ' sidebar__brand--entry' : ''}${brandId && here === brandId ? ' sidebar__brand--selected' : ''}${brandActive ? ' sidebar__brand--active' : ''}`}
        onClick={brandId ? () => onSelect(brandId) : undefined}
        onMouseMove={brandId ? (event) => { if (pointerMoved(event)) setIndex(0); } : undefined}
      >
        {member?.profile_image ? <Avatar src={member.profile_image} name={member.channel?.name || 'U'} size={52} className="avatar--corners" /> : <img src="icon.png" alt="" width={52} height={52} />}
        <span className="sidebar__label sidebar__brandName">{member?.channel?.name ? `@${member.channel.name}` : 'Odysee'}</span>
        <SquircleDefs />
      </div>
      <div className="sidebar__main">
        {middle.map((block, blockIndex) => <div key={blockIndex} className="sidebar__group">{block.map(renderItem)}</div>)}
      </div>
      {bottom.length > 0 && <div className="sidebar__group sidebar__group--bottom">{bottom.map(renderItem)}</div>}
    </nav>
  );
}
