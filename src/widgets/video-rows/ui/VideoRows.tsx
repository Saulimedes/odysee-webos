import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_GAP, KEY, PAGE_PADDING, SIDEBAR_WIDTH, rowCardMetrics, rowHeight, useSetting, type CardMetrics } from '@/shared/config';
import { PRIORITY, isPointerDriven, useKeys, useNav, useOkPress, useRemembered } from '@/shared/lib';
import { OdyseeIcon } from '@/shared/ui';
import { VideoCard, type Video } from '@/entities/video';

export interface VideoRow {
  id: string;
  title: string;
  icon?: string | null;
  videos: Video[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  hasMore?: boolean;
  progress?: (video: Video) => number;
}

interface Props {
  stateKey: string;
  rows: VideoRow[];
  onActiveRow?: (rowId: string) => void;
  onLoadMore?: (rowId: string) => void;
  onLeftEdge?: () => void;
  onTopEdge?: () => void;
  wrap?: boolean;
  enabled?: boolean;
}

const ROWS_BEFORE = 1;
const ROWS_AFTER = 2;
const BUFFER_CARDS = 3;
const ROW_TOP = 24;
const SETTLE_MS = 2500;
const WRAP_PAUSE_MS = 300;

function Skeleton({ count, width, height }: { count: number; width: number; height: number }) {
  const cells = [];
  for (let index = 0; index < count; index++) {
    cells.push(<div key={index} className="rowSkeleton" style={{ width, height, transform: `translate3d(${index * (width + CARD_GAP)}px,0,0)` }} />);
  }
  return <>{cells}</>;
}

interface RowViewProps {
  entry: VideoRow;
  selected: number;
  scroll: number;
  active: boolean;
  top: number;
  rowH: number;
  step: number;
  metrics: CardMetrics;
  viewportCards: number;
  settled: boolean;
  onPick: (rowId: string, index: number) => void;
  onHover: (rowId: string, index: number) => void;
  onMenu: (rowId: string, index: number) => void;
}

const RowView = memo(function RowView({ entry, selected, scroll, active, top, rowH, step, metrics, viewportCards, settled, onPick, onHover, onMenu }: RowViewProps) {
  const onSelect = useCallback((index: number) => onPick(entry.id, index), [onPick, entry.id]);
  const onPoint = useCallback((index: number) => onHover(entry.id, index), [onHover, entry.id]);
  const onContext = useCallback((index: number) => onMenu(entry.id, index), [onMenu, entry.id]);
  const offset = Math.max(0, scroll - 1) * step;
  const buffer = settled ? BUFFER_CARDS : 0;
  const from = Math.max(0, scroll - (settled ? BUFFER_CARDS : 1));
  const to = Math.min(entry.videos.length, scroll + viewportCards + buffer);
  const cards = [];
  for (let index = from; index < to; index++) {
    const video = entry.videos[index];
    cards.push(
      <div key={video.id} className="rowCell" style={{ width: metrics.width, height: metrics.height, transform: `translate3d(${index * step}px,0,0)` }}>
        <VideoCard
          video={video}
          index={index}
          active={active && index === selected}
          thumbWidth={metrics.width}
          progress={entry.progress?.(video)}
          onSelect={onSelect}
          onHover={onPoint}
          onMenu={onContext}
        />
      </div>,
    );
  }
  return (
    <div className={`videoRow${active ? ' videoRow--active' : ''}`} style={{ height: rowH, transform: `translate3d(0, ${top}px, 0)` }}>
      <h2 className="videoRow__title">
        {entry.icon && <OdyseeIcon name={entry.icon} size={36} follow />}
        {entry.title}
      </h2>
      <div className="videoRow__viewport" style={{ height: metrics.height + 24 }}>
        <div className="videoRow__track" style={{ width: Math.max(1, entry.videos.length) * step, transform: `translate3d(${-offset}px,0,0)` }}>
          {entry.videos.length === 0 ? <Skeleton count={viewportCards} width={metrics.width} height={metrics.height} /> : cards}
        </div>
      </div>
    </div>
  );
});

export function VideoRows({ stateKey, rows, onActiveRow, onLoadMore, onLeftEdge, onTopEdge, wrap = false, enabled = true }: Props) {
  const nav = useNav<Video>();
  const [tileScale] = useSetting('tileScale');
  const [textScale] = useSetting('textScale');
  const [activeId, setActiveId] = useRemembered<string | null>(`${stateKey}:row`, null);
  const [indexes, setIndexes] = useRemembered<Record<string, number>>(`${stateKey}:cols`, {});

  const metrics = useMemo(() => rowCardMetrics(), [tileScale, textScale]);
  const rowH = useMemo(() => rowHeight(), [tileScale, textScale]);
  const step = metrics.width + CARD_GAP;
  const viewportCards = Math.ceil((window.innerWidth - SIDEBAR_WIDTH) / step) + 1;

  const present = useMemo(() => rows.filter((row) => row.videos.length > 0 || row.status === 'idle' || row.status === 'loading'), [rows]);
  const lastRow = useRef(0);
  const found = present.findIndex((candidate) => candidate.id === activeId);
  const activeRow = found >= 0 ? found : Math.min(lastRow.current, Math.max(0, present.length - 1));
  lastRow.current = activeRow;
  const row = present[activeRow];
  const setActiveRow = (at: number) => setActiveId(present[at].id);
  const rowIndex = row ? Math.min(indexes[row.id] || 0, Math.max(0, row.videos.length - 1)) : 0;

  const [settled, setSettled] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hasCards = present.some((entry) => entry.videos.length > 0);
  const checkImages = useCallback(() => {
    const images = root.current ? Array.from(root.current.getElementsByTagName('img')) : [];
    if (images.every((image) => image.complete)) setSettled(true);
  }, []);
  useEffect(() => {
    if (settled || !hasCards) return undefined;
    checkImages();
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settled, hasCards, checkImages]);

  const rowId = row?.id;
  useEffect(() => {
    if (rowId) onActiveRow?.(rowId);
  }, [rowId, onActiveRow, present.length]);

  useEffect(() => {
    if (row && row.hasMore && row.videos.length - rowIndex <= 5) onLoadMore?.(row.id);
  }, [row, rowIndex, onLoadMore]);

  // Going on at an end only wraps round after a pause, so a held key or a long scroll of the wheel stops there
  const lastStep = useRef(0);
  const moveRow = (direction: number, fresh: boolean) => {
    const next = activeRow + direction;
    if (next >= 0 && next < present.length) setActiveRow(next);
    else if (wrap && fresh && present.length > 1) setActiveRow(direction > 0 ? 0 : present.length - 1);
    else if (direction < 0) onTopEdge?.();
  };

  const setColumn = (id: string, value: number) => setIndexes((previous) => ({ ...previous, [id]: value }));

  const pickRef = useRef<(rowId: string, index: number) => void>(() => undefined);
  pickRef.current = (rowId, index) => {
    const at = present.findIndex((candidate) => candidate.id === rowId);
    if (at < 0) return;
    setActiveRow(at);
    setColumn(rowId, index);
    if (present[at].videos[index]) nav.play(present[at].videos[index], present[at].videos);
  };

  const menuRef = useRef<(rowId: string, index: number) => void>(() => undefined);
  menuRef.current = (rowId, index) => {
    const video = present.find((candidate) => candidate.id === rowId)?.videos[index];
    if (video) nav.openMenu(video);
  };

  const hoverRef = useRef<(rowId: string, index: number) => void>(() => undefined);
  hoverRef.current = (rowId, index) => {
    const at = present.findIndex((candidate) => candidate.id === rowId);
    if (at < 0) return;
    if (at !== activeRow) setActiveRow(at);
    if ((indexes[rowId] || 0) !== index) setColumn(rowId, index);
  };

  const ok = useOkPress();

  useKeys((event) => {
    if (!row) return false;
    if (!settled) setSettled(true);
    switch (event.keyCode) {
      case KEY.UP:
      case KEY.DOWN: {
        const now = Date.now();
        const fresh = !event.repeat && now - lastStep.current >= WRAP_PAUSE_MS;
        lastStep.current = now;
        moveRow(event.keyCode === KEY.UP ? -1 : 1, fresh);
        return true;
      }
      case KEY.LEFT:
        if (rowIndex === 0) (onLeftEdge ?? nav.focusSidebar)();
        else setColumn(row.id, rowIndex - 1);
        return true;
      case KEY.RIGHT:
        if (rowIndex < row.videos.length - 1) setColumn(row.id, rowIndex + 1);
        return true;
      case KEY.ENTER: {
        const video = row.videos[rowIndex];
        if (video) ok.down(event, { press: () => nav.play(video, row.videos), hold: () => nav.openMenu(video) });
        return true;
      }
      default: return false;
    }
  }, {
    enabled: enabled && !nav.sidebarFocused,
    priority: PRIORITY.content,
    onKeyUp: (event) => { if (event.keyCode !== KEY.ENTER) return false; ok.up(); return true; },
  });

  const pick = useCallback((rowId: string, index: number) => pickRef.current(rowId, index), []);
  const hover = useCallback((rowId: string, index: number) => hoverRef.current(rowId, index), []);
  const menu = useCallback((rowId: string, index: number) => menuRef.current(rowId, index), []);
  const visibleRows = Math.max(1, Math.floor((window.innerHeight - ROW_TOP) / rowH));
  // The cursor must not scroll: content would slide under it and the next card would be picked
  const viewRow = useRef(activeRow);
  const pointer = isPointerDriven();
  if (!(pointer && activeRow >= viewRow.current && activeRow < viewRow.current + visibleRows)) viewRow.current = activeRow;
  const scrolls = useRef<Record<string, number>>({});
  const first = Math.max(0, viewRow.current - ROWS_BEFORE);
  const last = Math.min(present.length - 1, viewRow.current + (settled ? ROWS_AFTER : visibleRows - 1));
  const rendered = [];
  for (let at = first; at <= last; at++) {
    const entry = present[at];
    const selected = Math.min(indexes[entry.id] || 0, Math.max(0, entry.videos.length - 1));
    const kept = scrolls.current[entry.id];
    if (!(pointer && kept !== undefined && selected >= Math.max(0, kept - 1) && selected <= kept + viewportCards - 3)) scrolls.current[entry.id] = selected;
    rendered.push(
      <RowView
        key={entry.id}
        entry={entry}
        selected={selected}
        scroll={scrolls.current[entry.id]}
        active={enabled && at === activeRow}
        top={at * rowH}
        rowH={rowH}
        step={step}
        metrics={metrics}
        viewportCards={viewportCards}
        settled={settled}
        onPick={pick}
        onHover={hover}
        onMenu={menu}
      />,
    );
  }

  return (
    <div
      ref={root}
      className="videoRows"
      style={{ paddingLeft: PAGE_PADDING }}
      onLoadCapture={settled ? undefined : checkImages}
      onErrorCapture={settled ? undefined : checkImages}
    >
      <div className="videoRows__inner" style={{ height: present.length * rowH, transform: `translate3d(0, ${-viewRow.current * rowH}px, 0)` }}>
        {rendered}
      </div>
    </div>
  );
}
