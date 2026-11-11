import { useEffect, useMemo, useRef, useState } from 'react';
import { KEY, useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { useKeys, PRIORITY, cycle, pointerMoved } from '@/shared/lib';
import { Avatar, SquircleDefs } from '@/shared/ui';
import { useSession } from '@/entities/session';
import { useLayout, visibleItems } from '@/features/customize-layout';
import { LOCKED_ITEMS, LOGIN_ITEM, SIDEBAR_ITEMS, splitBlocks, type SidebarItem } from '../model/items';

const BASE_ICON_SIZE = 40;
const HEAVY_STROKE = 2.8;

interface Props {
  selected: string;
  focused: boolean;
  onSelect: (id: string) => void;
  onLeave: () => void;
  onFocus: () => void;
}

function MenuIcon({ item, variant, lit, size }: { item: SidebarItem; variant: string; lit: boolean; size: number }) {
  const solid = variant === 'filled' || (variant === 'dynamic' && lit);
  if (!solid) return <item.Icon size={size} stroke={1.5} />;
  if (item.Filled) return <item.Filled size={size} />;
  return <item.Icon size={size} stroke={HEAVY_STROKE} />;
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

  const brand = useMemo(() => SIDEBAR_ITEMS.find((item) => item.id === logoButton), [logoButton]);
  const { middle, bottom } = useMemo(() => {
    const shown = visibleItems(SIDEBAR_ITEMS.filter((item) => !item.account || user), layout, LOCKED_ITEMS).filter((item) => item.id !== brand?.id);
    return splitBlocks(user ? shown : [LOGIN_ITEM, ...shown]);
  }, [user, layout, brand]);
  const items = useMemo(() => [...(brand ? [brand] : []), ...middle.flat(), ...bottom], [brand, middle, bottom]);

  useEffect(() => {
    const at = items.findIndex((item) => item.id === selected);
    setIndex(at >= 0 ? at : 0);
  }, [items, selected]);

  useEffect(() => {
    if (focused) refs.current[index]?.scrollIntoView({ block: 'nearest' });
  }, [focused, index]);

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => cycle(current, -1, items.length)); return true;
      case KEY.DOWN: setIndex((current) => cycle(current, 1, items.length)); return true;
      case KEY.RIGHT: onLeave(); return true;
      case KEY.ENTER: onSelect(items[index].id); return true;
      default: return false;
    }
  }, { enabled: focused, priority: PRIORITY.sidebar });

  let flat = brand ? 1 : 0;
  const brandActive = Boolean(brand) && focused && index === 0;
  const renderItem = (item: SidebarItem) => {
    const position = flat++;
    const active = focused && position === index;
    const current = selected === item.id;
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
        ref={(element) => { if (brand) refs.current[0] = element; }}
        className={`sidebar__brand${brand ? ' sidebar__brand--entry' : ''}${brand && selected === brand.id ? ' sidebar__brand--selected' : ''}${brandActive ? ' sidebar__brand--active' : ''}`}
        onClick={brand ? () => onSelect(brand.id) : undefined}
        onMouseMove={brand ? (event) => { if (pointerMoved(event)) setIndex(0); } : undefined}
      >
        {!brand && user?.profile_image ? <Avatar src={user.profile_image} name={user.channel?.name || 'U'} size={52} className="avatar--corners" /> : <img src="icon.png" alt="" width={52} height={52} />}
        <span className="sidebar__label sidebar__brandName">{brand ? t(brand.label) : user?.channel?.name ? `@${user.channel.name}` : 'Odysee'}</span>
        <SquircleDefs />
      </div>
      <div className="sidebar__main">
        {middle.map((block, blockIndex) => <div key={blockIndex} className="sidebar__group">{block.map(renderItem)}</div>)}
      </div>
      {bottom.length > 0 && <div className="sidebar__group sidebar__group--bottom">{bottom.map(renderItem)}</div>}
    </nav>
  );
}
