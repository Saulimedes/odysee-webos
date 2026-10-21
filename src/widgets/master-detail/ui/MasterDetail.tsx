import { useEffect, useRef, type ReactNode } from 'react';
import { CARD_GAP, KEY, contentWidth, gridHeight } from '@/shared/config';
import { PRIORITY, useDebounced, useKeys, useNav, useRemembered } from '@/shared/lib';
import { Avatar, EmptyState, Spinner, VirtualGrid } from '@/shared/ui';

export interface MasterEntry {
  id: string;
  label: string;
  icon?: ReactNode;
  avatar?: string | null;
  dot?: boolean;
}

export interface DetailContext { enabled: boolean; width: number; height: number; leaveToList: () => void }

interface Props {
  stateKey: string;
  title: string;
  entries: MasterEntry[];
  loading?: boolean;
  emptyTitle: string;
  emptyIcon?: ReactNode;
  renderDetail: (entry: MasterEntry, context: DetailContext) => ReactNode;
}

const LIST_WIDTH = 440;
const ENTRY_HEIGHT = 76;
const ENTRY_GAP = 6;
const HEADER = 96;

export function MasterDetail({ stateKey, title, entries, loading, emptyTitle, emptyIcon, renderDetail }: Props) {
  const nav = useNav<unknown>();
  const [stored, setSelected] = useRemembered(`${stateKey}:selected`, 0);
  const [zone, setZone] = useRemembered<'list' | 'detail'>(`${stateKey}:zone`, 'list');
  const selected = Math.min(stored, Math.max(0, entries.length - 1));
  const entry = entries[selected];
  const settled = useDebounced(entry, 220);
  const detailEntry = settled && entries.some((candidate) => candidate.id === settled.id) ? settled : entry;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected !== stored) setSelected(selected);
  }, [selected, stored, setSelected]);

  const inList = zone === 'list' && !nav.sidebarFocused;
  const inDetail = zone === 'detail' && !nav.sidebarFocused;

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: setSelected(Math.max(0, selected - 1)); return true;
      case KEY.DOWN: setSelected(Math.min(entries.length - 1, selected + 1)); return true;
      case KEY.LEFT: nav.focusSidebar(); return true;
      case KEY.RIGHT:
      case KEY.ENTER: setZone('detail'); return true;
      default: return false;
    }
  }, { enabled: inList && entries.length > 0, priority: PRIORITY.content });

  useKeys((event) => {
    if (event.keyCode === KEY.LEFT || event.keyCode === KEY.WEBOS_BACK || event.keyCode === KEY.ESCAPE || event.keyCode === KEY.BACKSPACE) {
      setZone('list');
      return true;
    }
    return false;
  }, { enabled: inDetail, priority: PRIORITY.content - 1 });

  const detailWidth = contentWidth() - LIST_WIDTH - CARD_GAP * 2;
  const height = gridHeight();

  return (
    <div className="masterDetail">
      <aside className="masterDetail__list" style={{ width: LIST_WIDTH }} ref={listRef}>
        <h1 className="masterDetail__title">{title}</h1>
        {loading && entries.length === 0 ? (
          <div className="center" style={{ height: height }}><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} />
        ) : (
          <VirtualGrid
            items={entries}
            columns={1}
            cellWidth={LIST_WIDTH}
            cellHeight={ENTRY_HEIGHT}
            gap={ENTRY_GAP}
            height={window.innerHeight - HEADER}
            activeIndex={selected}
            getKey={(item) => item.id}
            renderItem={(item, index) => (
              <div
                className={`entry${index === selected ? ' entry--selected' : ''}${inList && index === selected ? ' entry--active' : ''}`}
                onClick={() => { setSelected(index); setZone('detail'); }}
              >
                {item.avatar !== undefined ? <span className="entry__avatar"><Avatar src={item.avatar} name={item.label} size={44} />{item.dot && <i className="entry__dot" />}</span> : item.icon}
                <span className="entry__label">{item.label}</span>
              </div>
            )}
          />
        )}
      </aside>
      <div className="masterDetail__detail">
        {detailEntry && renderDetail(detailEntry, { enabled: inDetail, width: detailWidth, height, leaveToList: () => setZone('list') })}
      </div>
    </div>
  );
}
