import { useEffect, useMemo, useState } from 'react';
import { suggestedVideos, type Video } from '@/entities/video';
import { useCollections } from '@/features/collections';

export function useNextVideo(video: Video, queue?: Video[]): Video | null {
  const { history } = useCollections();
  const queued = useMemo(() => {
    const at = queue ? queue.findIndex((entry) => entry.id === video.id) : -1;
    return at >= 0 && queue ? queue[at + 1] ?? null : null;
  }, [queue, video.id]);
  const hasQueued = queued !== null;
  const [suggested, setSuggested] = useState<Video[]>([]);

  useEffect(() => {
    setSuggested([]);
    if (hasQueued) return undefined;
    let cancelled = false;
    suggestedVideos(video)
      .then((videos) => { if (!cancelled) setSuggested(videos); })
      .catch((reason) => console.error('Failed to load related videos', reason));
    return () => { cancelled = true; };
  }, [video, hasQueued]);

  return useMemo(() => {
    if (queued) return queued;
    const watched = new Set(history.map((entry) => entry.id));
    return suggested.find((candidate) => candidate.id !== video.id && !watched.has(candidate.id)) ?? null;
  }, [queued, suggested, history, video.id]);
}
