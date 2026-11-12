import { useMemo, useState, type ReactNode } from 'react';
import { IconArrowsUpDown, IconEye, IconEyeOff, IconLock, IconRotate } from '@tabler/icons-react';
import { KEY, useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, cycle, pointerMoved, useBackdropClick, useKeys } from '@/shared/lib';
import { VirtualGrid } from '@/shared/ui';
import { arrange, isHidden, moveEntry, resetLayout, toggleEntry, useLayout, type LayoutKind } from '../model/layout';

const ROW_HEIGHT = 84;
const VISIBLE_ROWS = 7;

export interface LayoutEntry {
  id: string;
  label: string;
  icon?: ReactNode;
  note?: string;
  locked?: boolean;
  hiddenByDefault?: boolean;
}

export interface LayoutOption {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

interface Props {
  kind: LayoutKind;
  title: string;
  entries: LayoutEntry[];
  option?: LayoutOption;
  onClose: () => void;
}

type Row = { kind: 'entry'; id: string; entry: LayoutEntry } | { kind: 'option' } | { kind: 'reset' };

const rowKey = (row: Row) => (row.kind === 'entry' ? row.id : row.kind);

export function LayoutEditor({ kind, title, entries, option, onClose }: Props) {
  const t = useTranslation();
  const layout = useLayout(kind);
  const [textScale] = useSetting('textScale');
  const ordered = useMemo(() => arrange(entries, layout), [entries, layout]);
  const rows = useMemo<Row[]>(() => [
    ...ordered.map((entry): Row => ({ kind: 'entry', id: entry.id, entry })),
    ...(option ? [{ kind: 'option' } as Row] : []),
    { kind: 'reset' },
  ], [ordered, option]);
  const [index, setIndex] = useState(0);
  const [moving, setMoving] = useState(false);
  const at = Math.min(index, rows.length - 1);
  const current = rows[at];
  const backdrop = useBackdropClick(onClose);

  const activate = (row: Row) => {
    if (row.kind === 'reset') {
      resetLayout(kind);
      setIndex(0);
    } else if (row.kind === 'option') {
      option?.onToggle();
    } else if (!row.entry.locked) {
      toggleEntry(kind, row.id, row.entry.hiddenByDefault);
    }
  };

  const step = (direction: -1 | 1) => {
    const target = at + direction;
    if (moving) {
      if (current.kind === 'entry' && target >= 0 && target < ordered.length && moveEntry(kind, ordered.map((entry) => entry.id), current.id, direction)) setIndex(target);
    } else {
      setIndex(cycle(at, direction, rows.length));
    }
  };

  const hover = (event: React.MouseEvent, position: number) => {
    if (!moving && position !== at && pointerMoved(event)) setIndex(position);
  };

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: step(-1); return true;
      case KEY.DOWN: step(1); return true;
      case KEY.ENTER:
        if (moving) setMoving(false);
        else activate(current);
        return true;
      case KEY.RIGHT:
        if (current.kind === 'entry') setMoving((value) => !value);
        return true;
      case KEY.LEFT:
      case KEY.WEBOS_BACK:
      case KEY.ESCAPE:
      case KEY.BACKSPACE:
        if (moving) setMoving(false);
        else onClose();
        return true;
      default: return true;
    }
  }, { priority: PRIORITY.overlay });

  return (
    <div className="picker" {...backdrop}>
      <div className="picker__panel layoutEditor">
        <h2>{title}</h2>
        <VirtualGrid
          items={rows}
          columns={1}
          cellWidth={880}
          cellHeight={ROW_HEIGHT - 8 + Math.round(30 * (textScale - 1))}
          gap={8}
          height={ROW_HEIGHT * VISIBLE_ROWS}
          activeIndex={at}
          getKey={rowKey}
          renderItem={(row, position) => {
            const active = position === at;
            if (row.kind === 'reset') {
              return (
                <div className={`layoutRow layoutRow--reset${active ? ' layoutRow--active' : ''}`} onClick={() => activate(row)} onMouseMove={(event) => hover(event, position)}>
                  <span className="layoutRow__icon"><IconRotate size={36} /></span>
                  <span className="layoutRow__label">{t('Reset to default')}</span>
                </div>
              );
            }
            if (row.kind === 'option') {
              return (
                <div className={`layoutRow layoutRow--option${active ? ' layoutRow--active' : ''}`} onClick={() => { setIndex(position); activate(row); }} onMouseMove={(event) => hover(event, position)}>
                  <span className="layoutRow__label">{option?.label}</span>
                  <span className={`switch${option?.checked ? ' switch--on' : ''}`}><i /></span>
                </div>
              );
            }
            const { entry } = row;
            const hidden = !entry.locked && isHidden(entry, layout);
            return (
              <div
                className={`layoutRow${active ? ' layoutRow--active' : ''}${active && moving ? ' layoutRow--moving' : ''}${hidden ? ' layoutRow--hidden' : ''}`}
                onClick={() => { setIndex(position); activate(row); }}
                onMouseMove={(event) => hover(event, position)}
              >
                <span className="layoutRow__icon">{entry.icon}</span>
                <span className="layoutRow__label">
                  {entry.label}
                  {entry.note && <small>{entry.note}</small>}
                </span>
                {active && moving && <IconArrowsUpDown size={36} />}
                <span className="layoutRow__state">
                  {entry.locked ? <><IconLock size={32} /> {t('Always shown')}</> : hidden ? <><IconEyeOff size={32} /> {t('Hidden')}</> : <><IconEye size={32} /> {t('Shown')}</>}
                </span>
              </div>
            );
          }}
        />
        <p className="layoutEditor__hint">
          {moving ? t('Up and Down move the row. OK or Back drops it.') : t('OK shows or hides a row. Right picks it up to move it. Back when you are done.')}
        </p>
      </div>
    </div>
  );
}
