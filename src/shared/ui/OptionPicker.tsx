import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KEY } from '@/shared/config';
import { LOADER_MARKUP } from '@/shared/branding';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, cycle, isEnterHeld, pointerMoved, useKeys } from '@/shared/lib';
import { VirtualGrid } from './VirtualGrid';

const ITEM_HEIGHT = 84;
const VISIBLE = 7;
const POPOVER_ITEM_HEIGHT = 72;
const POPOVER_VISIBLE = 5;
const POPOVER_CELL_WIDTH = 496;
// A list that fits needs this much more room than its rows, or the grid scrolls a little whenever the last row is picked
const GRID_PAD = 12;

export interface PickerOption {
  code: string | number;
  name: string;
  family?: string | null;
  preview?: { bg: string; surface: string; text: string };
  icon?: ReactNode;
  value?: string;
  native?: boolean;
}

interface Props {
  title: string;
  options: PickerOption[];
  value: string | number;
  variant?: 'swatch' | 'font' | 'theme' | 'loader';
  placement?: 'center' | 'popover';
  onPreview?: (code: string | number) => void;
  onDismiss?: () => void;
  onClose: (confirmed: boolean, code: string | number) => void;
}

export function OptionPicker({ title, options, value, variant, placement = 'center', onPreview, onDismiss, onClose }: Props) {
  const t = useTranslation();
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((option) => option.code === value)));
  const armed = useRef(!isEnterHeld());
  const popover = placement === 'popover';
  const itemHeight = popover ? POPOVER_ITEM_HEIGHT : ITEM_HEIGHT;
  const height = !popover ? ITEM_HEIGHT * VISIBLE : options.length <= POPOVER_VISIBLE ? options.length * itemHeight + GRID_PAD : POPOVER_VISIBLE * itemHeight;

  useEffect(() => { onPreview?.(options[index].code); }, [index, options, onPreview]);

  useKeys((event) => {
    const code = options[index].code;
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => cycle(current, -1, options.length)); return true;
      case KEY.DOWN: setIndex((current) => cycle(current, 1, options.length)); return true;
      case KEY.ENTER:
        if (armed.current && !event.repeat) onClose(true, code);
        return true;
      case KEY.WEBOS_BACK:
      case KEY.ESCAPE:
      case KEY.BACKSPACE:
      case KEY.LEFT: onClose(false, code); return true;
      default: return true;
    }
  }, {
    priority: PRIORITY.overlay,
    onKeyUp: (event) => {
      if (event.keyCode === KEY.ENTER) armed.current = true;
      return false;
    },
  });

  return (
    <div
      className={`picker${popover ? ' picker--popover' : ''}`}
      onClick={popover && onDismiss ? (event) => { if (event.target === event.currentTarget) onDismiss(); } : undefined}
    >
      <div className="picker__panel">
        <h2>{title}</h2>
        <VirtualGrid
          items={options}
          columns={1}
          cellWidth={popover ? POPOVER_CELL_WIDTH : 640}
          cellHeight={itemHeight - 8}
          gap={8}
          height={height}
          activeIndex={index}
          getKey={(option) => String(option.code)}
          renderItem={(option, at) => (
            <div
              className={`pickerItem${at === index ? ' pickerItem--active' : ''}`}
              style={variant === 'font' && option.family ? { fontFamily: `'${option.family}', sans-serif` } : undefined}
              onClick={() => { setIndex(at); onPreview?.(option.code); onClose(true, option.code); }}
              onMouseMove={(event) => { if (at !== index && pointerMoved(event)) setIndex(at); }}
            >
              {variant === 'swatch' && <i className="swatch" style={{ background: String(option.code) }} />}
              {variant === 'theme' && option.preview && <ThemeSwatch preview={option.preview} />}
              {variant === 'loader' && <LoaderPreview code={String(option.code)} />}
              {option.icon && <span className="pickerItem__icon">{option.icon}</span>}
              {option.native ? option.name : t(option.name)}
              {option.value !== undefined ? <span className="pickerItem__value">{option.value}</span> : option.code === value && <span className="pickerItem__current">{t('current')}</span>}
            </div>
          )}
        />
      </div>
    </div>
  );
}

export function LoaderPreview({ code }: { code: string }) {
  const markup = (LOADER_MARKUP as Record<string, string>)[code] ?? '';
  return (
    <span className="loaderPreview">
      <span className={`loading-spinner loading-spinner--inline loader-${code}`} dangerouslySetInnerHTML={{ __html: markup }} />
    </span>
  );
}

export function ThemeSwatch({ preview }: { preview: NonNullable<PickerOption['preview']> }) {
  return (
    <i className="themeSwatch" style={{ background: preview.bg, borderColor: preview.text }}>
      <b style={{ background: preview.surface }} />
      <u style={{ background: preview.text }} />
    </i>
  );
}
