import { useEffect, useRef } from 'react';
import { formatDuration } from '@/shared/lib';

export function Timeline({ videoRef, focused }: { videoRef: React.RefObject<HTMLVideoElement | null>; focused: boolean }) {
  const fill = useRef<HTMLElement>(null);
  const buffer = useRef<HTMLElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const update = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const ratio = duration > 0 ? video.currentTime / duration : 0;
      if (fill.current) fill.current.style.transform = `scaleX(${ratio})`;
      if (current.current) current.current.textContent = formatDuration(video.currentTime) || '0:00';
      if (total.current) total.current.textContent = formatDuration(duration) || '0:00';
      if (buffer.current) {
        const end = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
        buffer.current.style.transform = `scaleX(${duration > 0 ? Math.min(1, end / duration) : 0})`;
      }
    };
    const events = ['timeupdate', 'durationchange', 'seeked', 'progress', 'loadedmetadata'];
    events.forEach((name) => video.addEventListener(name, update));
    update();
    return () => events.forEach((name) => video.removeEventListener(name, update));
  }, [videoRef]);

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    video.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * video.duration;
  };

  return (
    <div className="timeline">
      <span ref={current} className="timeline__time">0:00</span>
      <div className={`timeline__bar${focused ? ' timeline__bar--active' : ''}`} onClick={seek}>
        <i ref={buffer} className="timeline__buffer" />
        <i ref={fill} className="timeline__fill" />
      </div>
      <span ref={total} className="timeline__time">0:00</span>
    </div>
  );
}
