import { useEffect, useState } from 'react';
import { KEY } from '@/shared/config';
import { PRIORITY, useKeys } from '@/shared/lib';
import { VirtualGrid } from '@/shared/ui';
import type { Option } from './rows';

const ITEM_HEIGHT = 84;
const VISIBLE = 7;

interface Props {
  title: string;
  options: Option[];
  value: string | number;
  variant?: 'swatch' | 'font';
  onPreview: (code: string | number) => void;
  onClose: (confirmed: boolean) => void;
}

export function OptionPicker({ title, options, value, variant, onPreview, onClose }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((option) => option.code === value)));

  useEffect(() => { onPreview(options[index].code); }, [index, options, onPreview]);

  useKeys((event) => {
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => Math.max(0, current - 1)); return true;
      case KEY.DOWN: setIndex((current) => Math.min(options.length - 1, current + 1)); return true;
      case KEY.ENTER: onClose(true); return true;
      case KEY.WEBOS_BACK:
      case KEY.ESCAPE:
      case KEY.BACKSPACE:
      case KEY.LEFT: onClose(false); return true;
      default: return true;
    }
  }, { priority: PRIORITY.overlay });

  return (
    <div className="picker">
      <div className="picker__panel">
        <h2>{title}</h2>
        <VirtualGrid
          items={options}
          columns={1}
          cellWidth={640}
          cellHeight={ITEM_HEIGHT - 8}
          gap={8}
          height={ITEM_HEIGHT * VISIBLE}
          activeIndex={index}
          getKey={(option) => String(option.code)}
          renderItem={(option, at) => (
            <div
              className={`pickerItem${at === index ? ' pickerItem--active' : ''}`}
              style={variant === 'font' && option.family ? { fontFamily: `'${option.family}', sans-serif` } : undefined}
              onClick={() => { setIndex(at); onPreview(option.code); onClose(true); }}
            >
              {variant === 'swatch' && <i className="swatch" style={{ background: String(option.code) }} />}
              {option.name}
              {option.code === value && <span className="pickerItem__current">current</span>}
            </div>
          )}
        />
      </div>
    </div>
  );
}
