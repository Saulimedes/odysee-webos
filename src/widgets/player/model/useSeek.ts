import { useCallback, useRef } from 'react';

const RAMP = [10, 10, 20, 30, 60];
const RAMP_WINDOW_MS = 900;

export function useSeek(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const streak = useRef({ direction: 0, count: 0, at: 0 });

  return useCallback((direction: 1 | -1, ramp = true) => {
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    const last = streak.current;
    const count = ramp && last.direction === direction && now - last.at < RAMP_WINDOW_MS ? last.count + 1 : 0;
    streak.current = { direction, count, at: now };
    const step = ramp ? RAMP[Math.min(count, RAMP.length - 1)] : 10;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + direction * step));
  }, [videoRef]);
}
