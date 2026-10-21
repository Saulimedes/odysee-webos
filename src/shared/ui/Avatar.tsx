import { memo, useState } from 'react';
import { thumbUrl } from '@/shared/lib';

const failed = new Set<string>();

export const Avatar = memo(function Avatar({ src, name, size }: { src?: string | null; name: string; size: number }) {
  const [broken, setBroken] = useState(() => (src ? failed.has(src) : false));
  const letter = (name || '?').charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (!src || broken) return <span className="avatar" style={style}>{letter}</span>;
  return (
    <span className="avatar" style={style}>
      <img
        src={thumbUrl(src, size * 2) as string}
        alt=""
        decoding="async"
        onError={() => { failed.add(src); setBroken(true); }}
      />
    </span>
  );
});
