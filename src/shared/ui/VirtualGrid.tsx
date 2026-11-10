import { memo, useRef, type ReactNode } from 'react';
import { isPointerDriven } from '@/shared/lib';

const OVERSCAN_ROWS = 1;
const EDGE = 28;
// The content starts PAD below the top of the clipped box, the same room is kept below the last row
const PAD = 10;

interface Props<T> {
  items: T[];
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  height: number;
  activeIndex: number;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number, active: boolean) => ReactNode;
}

function VirtualGridInner<T>({ items, columns, cellWidth, cellHeight, gap, height, activeIndex, getKey, renderItem }: Props<T>) {
  const rowHeight = cellHeight + gap;
  const totalRows = Math.ceil(items.length / columns);
  const topRef = useRef(0);

  const activeRow = Math.floor(activeIndex / columns);
  const rowTop = activeRow * rowHeight;
  let top = topRef.current;
  // A tile the cursor picked is on screen, and the list stays where it is: scrolling would slide the next tile under the cursor
  const onScreen = rowTop + cellHeight > top && rowTop < top + height;
  if (isPointerDriven() && onScreen) top = topRef.current;
  else if (rowTop - EDGE < top) top = rowTop - EDGE;
  else if (rowTop + cellHeight + EDGE > top + height) top = rowTop + cellHeight + EDGE - height;
  top = Math.max(0, Math.min(top, Math.max(0, totalRows * rowHeight - gap + PAD * 2 - height)));
  topRef.current = top;

  const first = Math.max(0, Math.floor(top / rowHeight) - OVERSCAN_ROWS);
  const last = Math.min(totalRows - 1, Math.ceil((top + height) / rowHeight) + OVERSCAN_ROWS);
  const cells: ReactNode[] = [];
  for (let index = first * columns; index < Math.min(items.length, (last + 1) * columns); index++) {
    const item = items[index];
    cells.push(
      <div
        key={getKey(item)}
        className="vcell"
        style={{
          width: cellWidth,
          height: cellHeight,
          transform: `translate3d(${(index % columns) * (cellWidth + gap)}px, ${Math.floor(index / columns) * rowHeight}px, 0)`,
        }}
      >
        {renderItem(item, index, index === activeIndex)}
      </div>,
    );
  }

  return (
    <div className="vgrid" style={{ height }}>
      <div className="vgrid__inner" style={{ height: totalRows * rowHeight, transform: `translate3d(0, ${-top}px, 0)` }}>
        {cells}
      </div>
    </div>
  );
}

export const VirtualGrid = memo(VirtualGridInner) as typeof VirtualGridInner;
