import { memo, useState } from 'react';
import { IconPlayerPlay } from '@tabler/icons-react';
import { thumbUrl } from '@/shared/lib';

export const Thumb = memo(function Thumb({ src, width }: { src: string | null; width: number }) {
  const [state, setState] = useState({ src, level: 0 });
  const optimized = thumbUrl(src, width);
  const level = state.src === src ? state.level : 0;
  const source = level === 0 ? optimized : level === 1 ? src : null;

  if (!source) return <div className="thumb thumb--empty"><IconPlayerPlay size={56} /></div>;
  return (
    <img
      className="thumb"
      src={source}
      alt=""
      decoding="async"
      onError={() => setState({ src, level: level === 0 && optimized !== src ? 1 : 2 })}
    />
  );
});
