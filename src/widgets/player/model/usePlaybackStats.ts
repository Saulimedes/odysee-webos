import { useEffect, useRef, useState, type RefObject } from 'react';
import { collectStats, nextRate, type StatRow, type StatsContext, type StatsRate } from './playbackStats';

const SAMPLE_MS = 1000;

export function usePlaybackStats(videoRef: RefObject<HTMLVideoElement | null>, context: StatsContext, active: boolean) {
  const [rows, setRows] = useState<StatRow[]>([]);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    const element = videoRef.current;
    if (!active || !element) {
      setRows([]);
      return undefined;
    }
    let rate: StatsRate | null = null;
    const sample = () => {
      const current = contextRef.current;
      rate = nextRate(rate, Date.now(), element, current.speed);
      setRows(collectStats(element, current, rate));
    };
    sample();
    const timer = setInterval(sample, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [active, videoRef]);

  return rows;
}
