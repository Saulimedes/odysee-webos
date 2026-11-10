import { memo, useEffect, useRef, useState } from 'react';
import { IconPlayerPlay } from '@tabler/icons-react';
import { stillThumbUrl, thumbUrl } from '@/shared/lib';

const PLAY_AFTER_MS = 250;

interface Props {
  src: string | null;
  width: number;
  focused?: boolean;
}

export const Thumb = memo(function Thumb({ src, width, focused }: Props) {
  const [state, setState] = useState({ src, level: 0 });
  const [dwelled, setDwelled] = useState(false);
  const still = focused === undefined ? null : stillThumbUrl(src, width);
  const optimized = thumbUrl(src, width);

  const played = useRef(false);
  useEffect(() => {
    if (!still || !focused) return undefined;
    const timer = setTimeout(() => { played.current = true; setDwelled(true); }, PLAY_AFTER_MS);
    return () => {
      clearTimeout(timer);
      if (played.current) { played.current = false; setDwelled(false); }
    };
  }, [still, focused]);

  const candidates = [still && !(focused && dwelled) ? still : optimized, optimized, src].filter((url, at, all): url is string => Boolean(url) && all.indexOf(url) === at);
  const level = state.src === src ? state.level : 0;
  const source = candidates[level] ?? null;

  if (!source) return <div className="thumb thumb--empty"><IconPlayerPlay size={56} /></div>;
  return (
    <img
      className="thumb"
      src={source}
      alt=""
      decoding="async"
      onError={() => setState({ src, level: level + 1 })}
    />
  );
});
