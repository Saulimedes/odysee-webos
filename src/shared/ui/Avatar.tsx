import { memo, useState } from 'react';
import { thumbUrl } from '@/shared/lib';

const failed = new Set<string>();
const SQUIRCLE = 'M1 .5C1 .3126 1.0053 .1644 .9204 .0796C.8356 -.0053 .6874 0 .5 0C.3126 0 .1644 -.0053 .0796 .0796C-.0053 .1644 0 .3126 0 .5C0 .6874 -.0053 .8356 .0796 .9204C.1644 1.0053 .3126 1 .5 1C.6874 1 .8356 1.0053 .9204 .9204C1.0053 .8356 1 .6874 1 .5Z';

// The shape that avatars with the avatar--corners class are cut to in the Classic corner style, mounted once
export function SquircleDefs() {
  return (
    <svg className="squircleDefs" width="0" height="0" aria-hidden="true" focusable="false">
      <clipPath id="squircle" clipPathUnits="objectBoundingBox"><path d={SQUIRCLE} /></clipPath>
    </svg>
  );
}

interface Props {
  src?: string | null;
  name: string;
  size: number;
  className?: string;
}

export const Avatar = memo(function Avatar({ src, name, size, className }: Props) {
  const [broken, setBroken] = useState(() => (src ? failed.has(src) : false));
  const letter = (name || '?').charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  const classes = className ? `avatar ${className}` : 'avatar';
  if (!src || broken) return <span className={classes} style={style}>{letter}</span>;
  return (
    <span className={classes} style={style}>
      <img
        src={thumbUrl(src, size * 2) as string}
        alt=""
        decoding="async"
        onError={() => { failed.add(src); setBroken(true); }}
      />
    </span>
  );
});
