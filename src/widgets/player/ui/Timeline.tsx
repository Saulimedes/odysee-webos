import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/shared/lib';

const SEEK_EVERY_MS = 150;
const KEEP_ALIVE_MS = 1000;
// A tap is followed by emulated mouse events that must not start a second drag
const EMULATED_MOUSE_MS = 800;

const lengthOf = (video: HTMLVideoElement) => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
const clock = (seconds: number) => formatDuration(seconds) || '0:00';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  focused: boolean;
  onActivity?: () => void;
}

export function Timeline({ videoRef, focused, onActivity }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const buffer = useRef<HTMLElement>(null);
  const handle = useRef<HTMLElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<(() => void) | null>(null);
  const lastTouch = useRef(0);
  const activity = useRef(onActivity);

  useEffect(() => { activity.current = onActivity; });

  const ping = useCallback(() => activity.current?.(), []);

  const paint = useCallback((ratio: number, seconds: number) => {
    if (fill.current) fill.current.style.transform = `scaleX(${ratio})`;
    if (handle.current) handle.current.style.left = `${ratio * 100}%`;
    if (current.current) current.current.textContent = clock(seconds);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const update = () => {
      const duration = lengthOf(video);
      if (!drag.current) paint(duration > 0 ? Math.max(0, Math.min(1, video.currentTime / duration)) : 0, video.currentTime);
      if (total.current) total.current.textContent = clock(duration);
      if (buffer.current) {
        const end = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
        buffer.current.style.transform = `scaleX(${duration > 0 ? Math.min(1, end / duration) : 0})`;
      }
    };
    const events = ['timeupdate', 'durationchange', 'seeked', 'progress', 'loadedmetadata'];
    events.forEach((name) => video.addEventListener(name, update));
    update();
    return () => events.forEach((name) => video.removeEventListener(name, update));
  }, [videoRef, paint]);

  useEffect(() => () => drag.current?.(), []);

  const ratioAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
  };

  const showLabel = (ratio: number, seconds: number) => {
    if (label.current) {
      label.current.style.left = `${ratio * 100}%`;
      label.current.textContent = clock(seconds);
    }
  };

  const recentTouch = () => Date.now() - lastTouch.current < EMULATED_MOUSE_MS;

  const startDrag = (clientX: number, touch: boolean) => {
    const video = videoRef.current;
    const duration = video ? lengthOf(video) : 0;
    if (!video || duration <= 0) return;
    drag.current?.();
    let lastX = clientX;
    let wanted = 0;
    let sentAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      clearTimeout(timer);
      timer = undefined;
      sentAt = Date.now();
      video.currentTime = wanted;
    };
    const place = (x: number) => {
      lastX = x;
      const ratio = ratioAt(x);
      wanted = ratio * duration;
      paint(ratio, wanted);
      showLabel(ratio, wanted);
    };
    const follow = (x: number) => {
      place(x);
      const wait = SEEK_EVERY_MS - (Date.now() - sentAt);
      if (wait <= 0) send();
      else if (timer === undefined) timer = setTimeout(send, wait);
      ping();
    };
    const alive = setInterval(ping, KEEP_ALIVE_MS);

    const onMouseMove = (event: MouseEvent) => follow(event.clientX);
    const onMouseUp = (event: MouseEvent) => finish(event.clientX);
    const onTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
      const point = event.touches[0];
      if (point) follow(point.clientX);
    };
    const onTouchEnd = (event: TouchEvent) => {
      lastTouch.current = Date.now();
      const point = event.changedTouches[0];
      finish(point ? point.clientX : lastX);
    };
    const listeners: Array<[string, EventListener, AddEventListenerOptions | undefined]> = touch
      ? [['touchmove', onTouchMove as EventListener, { passive: false }], ['touchend', onTouchEnd as EventListener, undefined], ['touchcancel', onTouchEnd as EventListener, undefined]]
      : [['mousemove', onMouseMove as EventListener, undefined], ['mouseup', onMouseUp as EventListener, undefined]];
    listeners.forEach(([name, listener, options]) => window.addEventListener(name, listener, options));

    const stop = () => {
      clearTimeout(timer);
      clearInterval(alive);
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
      drag.current = null;
    };
    const finish = (x: number) => {
      place(x);
      send();
      stop();
      setDragging(false);
      ping();
    };
    drag.current = stop;
    setDragging(true);
    follow(clientX);
  };

  const onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || recentTouch()) return;
    event.preventDefault();
    startDrag(event.clientX, false);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    lastTouch.current = Date.now();
    const point = event.touches[0];
    if (point) startDrag(point.clientX, true);
  };

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current || recentTouch()) return;
    setHover(true);
    const video = videoRef.current;
    const ratio = ratioAt(event.clientX);
    showLabel(ratio, ratio * (video ? lengthOf(video) : 0));
    ping();
  };

  const onMouseEnter = () => { if (!recentTouch()) setHover(true); };
  const onMouseLeave = () => setHover(false);

  const big = focused || hover || dragging;

  return (
    <div className="timeline">
      <span ref={current} className="timeline__time">0:00</span>
      <div
        ref={track}
        className="timeline__track"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
      >
        <div className={`timeline__bar${focused ? ' timeline__bar--active' : ''}`}>
          <i ref={buffer} className="timeline__buffer" />
          <i ref={fill} className="timeline__fill" />
        </div>
        <i ref={handle} className={`timeline__handle${big ? ' timeline__handle--active' : ''}`} />
        <span ref={label} className={`timeline__label${hover || dragging ? ' timeline__label--visible' : ''}`} />
      </div>
      <span ref={total} className="timeline__time">0:00</span>
    </div>
  );
}
