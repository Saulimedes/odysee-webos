import { useEffect, useRef, type RefObject } from 'react';
import { applyPlayRate } from '@/shared/lib';

const RETRY_MS = 500;
const PENDING_TRIES = 20;
const FAILED_TRIES = 4;

export function usePlaybackSpeed(videoRef: RefObject<HTMLVideoElement | null>, speed: number, onUnsupported: () => void) {
  const changedRef = useRef(false);
  const unsupportedRef = useRef(onUnsupported);
  unsupportedRef.current = onUnsupported;

  useEffect(() => {
    const video = videoRef.current;
    if (speed !== 1) changedRef.current = true;
    if (!video || (speed === 1 && !changedRef.current)) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const apply = async () => {
      clearTimeout(timer);
      const result = await applyPlayRate(video, speed);
      if (cancelled) return;
      if (result === 'ok') return;
      failures += 1;
      if (failures < (result === 'pending' ? PENDING_TRIES : FAILED_TRIES)) timer = setTimeout(apply, RETRY_MS);
      else unsupportedRef.current();
    };
    const restart = () => {
      failures = 0;
      void apply();
    };

    restart();
    video.addEventListener('loadedmetadata', restart);
    video.addEventListener('playing', restart);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', restart);
      video.removeEventListener('playing', restart);
    };
  }, [videoRef, speed]);
}
