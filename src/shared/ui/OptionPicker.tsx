import { useEffect, useState, type ReactNode } from 'react';
import { KEY } from '@/shared/config';
import { LOADER_MARKUP } from '@/shared/branding';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, cycle, pointerMoved, useKeys } from '@/shared/lib';
import { VirtualGrid } from './VirtualGrid';

const ITEM_HEIGHT = 84;
const VISIBLE = 7;

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
  onPreview?: (code: string | number) => void;
  onClose: (confirmed: boolean, code: string | number) => void;
}

export function OptionPicker({ title, options, value, variant, onPreview, onClose }: Props) {
  const t = useTranslation();
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((option) => option.code === value)));

  useEffect(() => { onPreview?.(options[index].code); }, [index, options, onPreview]);

  useKeys((event) => {
    const code = options[index].code;
    switch (event.keyCode) {
      case KEY.UP: setIndex((current) => cycle(current, -1, options.length)); return true;
      case KEY.DOWN: setIndex((current) => cycle(current, 1, options.length)); return true;
      case KEY.ENTER: onClose(true, code); return true;
      case KEY.WEBOS_BACK:
      case KEY.ESCAPE:
      case KEY.BACKSPACE:
      case KEY.LEFT: onClose(false, code); return true;
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
