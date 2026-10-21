import { useEffect, useMemo } from 'react';
import { CARD_GAP, KEY, PAGE_PADDING, SIDEBAR_WIDTH, rowCardMetrics, rowHeight, useSetting } from '@/shared/config';
import { PRIORITY, useKeys, useNav, useRemembered } from '@/shared/lib';
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
  enabled?: boolean;
}

const ROWS_BEFORE = 1;
const ROWS_AFTER = 2;

function Skeleton({ count, width, height }: { count: number; width: number; height: number }) {
  const cells = [];
  for (let index = 0; index < count; index++) {
    cells.push(<div key={index} className="rowSkeleton" style={{ width, height, transform: `translate3d(${index * (width + CARD_GAP)}px,0,0)` }} />);
  }
  return <>{cells}</>;
}

export function VideoRows({ stateKey, rows, onActiveRow, onLoadMore, onLeftEdge, onTopEdge, enabled = true }: Props) {
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
  const activeRow = Math.max(0, present.findIndex((candidate) => candidate.id === activeId));
  const row = present[activeRow];
  const setActiveRow = (at: number) => setActiveId(present[at].id);
  const rowIndex = row ? Math.min(indexes[row.id] || 0, Math.max(0, row.videos.length - 1)) : 0;

  const rowId = row?.id;
  useEffect(() => {
    if (rowId) onActiveRow?.(rowId);
  }, [rowId, onActiveRow, present.length]);

  useEffect(() => {
    if (row && row.hasMore && row.videos.length - rowIndex <= 5) onLoadMore?.(row.id);
  }, [row, rowIndex, onLoadMore]);

  const moveRow = (direction: number) => {
    let next = activeRow + direction;
    while (next >= 0 && next < present.length && present[next].videos.length === 0) next += direction;
    if (next >= 0 && next < present.length) setActiveRow(next);
    else if (direction < 0) onTopEdge?.();
  };

  const setColumn = (id: string, value: number) => setIndexes((previous) => ({ ...previous, [id]: value }));

  useKeys((event) => {
    if (!row) return false;
    switch (event.keyCode) {
      case KEY.UP: moveRow(-1); return true;
      case KEY.DOWN: moveRow(1); return true;
      case KEY.LEFT:
        if (rowIndex === 0) (onLeftEdge ?? nav.focusSidebar)();
        else setColumn(row.id, rowIndex - 1);
        return true;
      case KEY.RIGHT:
        if (rowIndex < row.videos.length - 1) setColumn(row.id, rowIndex + 1);
        return true;
      case KEY.ENTER:
        if (row.videos[rowIndex]) nav.play(row.videos[rowIndex]);
        return true;
      default: return false;
    }
  }, { enabled: enabled && !nav.sidebarFocused, priority: PRIORITY.content });

  const first = Math.max(0, activeRow - ROWS_BEFORE);
  const last = Math.min(present.length - 1, activeRow + ROWS_AFTER);
  const rendered = [];
  for (let at = first; at <= last; at++) {
    const entry = present[at];
    const selected = Math.min(indexes[entry.id] || 0, Math.max(0, entry.videos.length - 1));
    const offset = Math.max(0, selected - 1) * step;
    const from = Math.max(0, selected - 3);
    const to = Math.min(entry.videos.length, selected + viewportCards + 3);
    const cards = [];
    for (let index = from; index < to; index++) {
      const video = entry.videos[index];
      cards.push(
        <div key={video.id} className="rowCell" style={{ width: metrics.width, height: metrics.height, transform: `translate3d(${index * step}px,0,0)` }}>
          <VideoCard
            video={video}
            index={index}
            active={enabled && at === activeRow && index === selected}
            thumbWidth={metrics.width}
            progress={entry.progress?.(video)}
            onSelect={(picked) => { setActiveRow(at); setColumn(entry.id, picked); nav.play(entry.videos[picked]); }}
          />
        </div>,
      );
    }
    rendered.push(
      <div key={entry.id} className="videoRow" style={{ height: rowH, transform: `translate3d(0, ${at * rowH}px, 0)` }}>
        <h2 className="videoRow__title">
          {entry.icon && <OdyseeIcon name={entry.icon} size={36} />}
          {entry.title}
        </h2>
        <div className="videoRow__viewport" style={{ height: metrics.height + 24 }}>
          <div className="videoRow__track" style={{ width: Math.max(1, entry.videos.length) * step, transform: `translate3d(${-offset}px,0,0)` }}>
            {entry.videos.length === 0 ? <Skeleton count={viewportCards} width={metrics.width} height={metrics.height} /> : cards}
          </div>
        </div>
      </div>,
    );
  }

  return (
    <div
      className="videoRows"
      style={{ paddingLeft: PAGE_PADDING }}
      onWheel={(event) => moveRow(event.deltaY > 0 ? 1 : -1)}
    >
      <div className="videoRows__inner" style={{ height: present.length * rowH, transform: `translate3d(0, ${-activeRow * rowH}px, 0)` }}>
        {rendered}
      </div>
    </div>
  );
}
