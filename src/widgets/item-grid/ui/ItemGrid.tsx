import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { PRIORITY, useGridNav, useNav, useRemembered } from '@/shared/lib';
import { gridHeight, CARD_GAP } from '@/shared/config';
import { EmptyState, PageTitle, Spinner, VirtualGrid } from '@/shared/ui';

const NEAR_END_ROWS = 2;

export interface GridLayout { columns: number; card: { width: number; height: number }; rowHeight: number }

interface Props<T> {
  stateKey: string;
  title?: string;
  subtitle?: string;
  items: T[];
  layout: GridLayout;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: ReactNode;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number, active: boolean, pick: (index: number) => void, hover: (index: number) => void) => ReactNode;
  onSelect: (item: T, index: number) => void;
  onLoadMore?: () => void;
  onLeftEdge?: () => void;
  onTopEdge?: () => void;
  enabled?: boolean;
  height?: number;
}

export function ItemGrid<T>({
  stateKey, title, subtitle, items, layout, loading, loadingMore, error, emptyTitle, emptyHint, emptyIcon,
  getKey, renderItem, onSelect, onLoadMore, onLeftEdge, onTopEdge, enabled = true, height,
}: Props<T>) {
  const nav = useNav<unknown>();
  const [stored, setIndex] = useRemembered(`${stateKey}:index`, 0);
  const index = Math.min(stored, Math.max(0, items.length - 1));
  const viewport = height ?? gridHeight();
  const { columns } = layout;

  useEffect(() => {
    if (index !== stored) setIndex(index);
  }, [index, stored, setIndex]);

  const itemsRef = useRef(items);
  const selectRef = useRef(onSelect);
  itemsRef.current = items;
  selectRef.current = onSelect;
  const pick = useCallback((at: number) => {
    setIndex(at);
    selectRef.current(itemsRef.current[at], at);
  }, [setIndex]);

  const hover = useCallback((at: number) => setIndex(at), [setIndex]);

  const active = enabled && !nav.sidebarFocused;
  useGridNav({
    count: items.length,
    columns,
    index,
    setIndex,
    onSelect: pick,
    onLeftEdge: onLeftEdge ?? nav.focusSidebar,
    onTopEdge,
    onNearEnd: onLoadMore,
    enabled: active,
    priority: PRIORITY.content,
  });

  const nearEnd = items.length > 0 && Math.floor(index / columns) >= Math.floor((items.length - 1) / columns) - NEAR_END_ROWS;
  useEffect(() => {
    if (active && nearEnd) onLoadMore?.();
  }, [active, nearEnd, items.length, onLoadMore]);

  return (
    <section className="itemGrid">
      {title !== undefined && <PageTitle sub={subtitle}>{title}</PageTitle>}
      {loading && items.length === 0 ? (
        <div className="center" style={{ height: viewport }}><Spinner /></div>
      ) : error && items.length === 0 ? (
        <EmptyState icon={emptyIcon} title={error} />
      ) : items.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <>
          <VirtualGrid
            items={items}
            columns={columns}
            cellWidth={layout.card.width}
            cellHeight={layout.card.height}
            gap={CARD_GAP}
            height={viewport}
            activeIndex={index}
            getKey={getKey}
            renderItem={(item, at, active) => renderItem(item, at, active, pick, hover)}
          />
          {loadingMore && <div className="itemGrid__more"><Spinner inline /></div>}
        </>
      )}
    </section>
  );
}
