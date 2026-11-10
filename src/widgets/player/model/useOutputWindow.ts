import { useEffect, useRef, type RefObject } from 'react';
import { applyOutputWindow, usesOutputWindow } from '@/shared/lib';

const RETRY_MS = 500;
const REFRESH_MS = 3000;
const PENDING_TRIES = 40;
const FAILED_TRIES = 5;

export function useOutputWindow(videoRef: RefObject<HTMLVideoElement | null>, mode: string) {
  const activeRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !usesOutputWindow()) return undefined;
    if (mode === 'auto' && !activeRef.current) return undefined;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    let failures = 0;

    const apply = async () => {
      if (cancelled) return;
      const result = await applyOutputWindow(video, mode);
      if (cancelled || result === 'wait') return;
      if (result === 'ok') {
        failures = 0;
        activeRef.current = mode !== 'auto';
        if (mode !== 'auto' && !refreshTimer) refreshTimer = setInterval(() => void apply(), REFRESH_MS);
        return;
      }
      failures += 1;
      if (failures < (result === 'pending' ? PENDING_TRIES : FAILED_TRIES)) retryTimer = setTimeout(() => void apply(), RETRY_MS);
    };
    const run = () => { void apply(); };

    run();
    video.addEventListener('loadedmetadata', run);
    video.addEventListener('resize', run);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(refreshTimer);
      video.removeEventListener('loadedmetadata', run);
      video.removeEventListener('resize', run);
    };
  }, [videoRef, mode]);
}
