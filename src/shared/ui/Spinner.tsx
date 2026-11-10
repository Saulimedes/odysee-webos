import type { CSSProperties } from 'react';
import { LOADER_MARKUP } from '@/shared/branding';
import { SETTING_DEFAULTS, useSetting } from '@/shared/config';

const MARKUP = LOADER_MARKUP as Record<string, string>;

interface Props {
  inline?: boolean;
  scale?: number;
}

export function Spinner({ inline = false, scale = 1 }: Props) {
  const [style] = useSetting('loaderStyle');
  if (inline) return <div className="spinner spinner--inline" role="status" aria-label="Loading" />;
  const code = style in MARKUP ? style : SETTING_DEFAULTS.loaderStyle;
  return (
    <div
      className={`loading-spinner loading-spinner--inline loader-${code}`}
      style={{ '--boot-scale': scale } as CSSProperties}
      role="status"
      aria-label="Loading"
      dangerouslySetInnerHTML={{ __html: MARKUP[code] }}
    />
  );
}
