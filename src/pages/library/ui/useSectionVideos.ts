import { useMemo } from 'react';
import type { Video } from '@/entities/video';
import { useCollections } from '@/features/collections';
import { progressPercent, usePlaybackHistory } from '@/features/playback-history';
import type { SectionId } from './sections';

export function useSectionVideos() {
  const lists = useCollections();
  const history = usePlaybackHistory();
  return useMemo(() => {
    const percent = new Map(history.map((item) => [item.video.id, progressPercent(item)]));
    const videos: Record<SectionId, Video[]> = {
      continue: history.map((item) => item.video),
      'watch-later': lists.watchLater,
      favorites: lists.favorites,
      history: lists.history,
    };
    return { videos, progress: (video: Video) => percent.get(video.id) || 0 };
  }, [lists, history]);
}
