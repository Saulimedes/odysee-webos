import { KEY } from '@/shared/config';
import { useKeys, PRIORITY } from './keys';
import { useOkPress } from './okPress';

interface GridNav {
  count: number;
  columns: number;
  index: number;
  setIndex: (next: number) => void;
  onSelect: (index: number) => void;
  onHold?: (index: number) => void;
  onLeftEdge?: () => void;
  onTopEdge?: () => void;
  onNearEnd?: () => void;
  enabled?: boolean;
  priority?: number;
}

export function useGridNav({ count, columns, index, setIndex, onSelect, onHold, onLeftEdge, onTopEdge, onNearEnd, enabled = true, priority = PRIORITY.content }: GridNav) {
  const ok = useOkPress();
  useKeys((event) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const lastRow = Math.floor((count - 1) / columns);

    switch (event.keyCode) {
      case KEY.UP:
        if (row > 0) setIndex(index - columns);
        else if (onTopEdge) onTopEdge();
        return true;
      case KEY.DOWN:
        if (index + columns < count) setIndex(index + columns);
        else if (row < lastRow) setIndex(count - 1);
        if (row >= lastRow - 2) onNearEnd?.();
        return true;
      case KEY.LEFT:
        if (col === 0) onLeftEdge?.();
        else setIndex(index - 1);
        return true;
      case KEY.RIGHT:
        if (col < columns - 1 && index < count - 1) setIndex(index + 1);
        return true;
      case KEY.ENTER:
        if (index >= count) return true;
        if (onHold) ok.down(event, { press: () => onSelect(index), hold: () => onHold(index) });
        else if (!event.repeat) onSelect(index);
        return true;
      default:
        return false;
    }
  }, {
    enabled: enabled && count > 0,
    priority,
    onKeyUp: onHold ? (event) => { if (event.keyCode !== KEY.ENTER) return false; ok.up(); return true; } : undefined,
  });
}
