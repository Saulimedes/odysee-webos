import { useCallback, useEffect, useRef, useState } from 'react';
import { peek, store } from '@/shared/api';
import { t } from '@/shared/i18n';
import type { Video } from '@/entities/video';

interface FeedState { videos: Video[]; page: number; hasMore: boolean }

export type FirstPage = () => { videos: Video[]; stale: boolean } | undefined;

const FRESH_MS = 5 * 60 * 1000;

function restore(key: string) {
  const hit = peek<FeedState>(`feed:${key}`, { ttl: FRESH_MS });
  return hit && !hit.stale ? hit.value : null;
}

export function usePagedFeed(key: string, fetchPage: (page: number) => Promise<Video[]>, pageSize: number, firstPage?: FirstPage) {
  const [known] = useState(() => (restore(key) ? undefined : firstPage?.()));
  const [state, setState] = useState<FeedState | null>(() => restore(key) ?? (known ? { videos: known.videos, page: 1, hasMore: known.videos.length >= pageSize } : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchPage);
  const busyRef = useRef(false);
  const stateRef = useRef(state);
  fetchRef.current = fetchPage;
  stateRef.current = state;

  const commit = useCallback((next: FeedState) => {
    store(`feed:${key}`, next);
    stateRef.current = next;
    setState(next);
  }, [key]);

  const load = useCallback(async (page: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (page > 1 || !stateRef.current) setLoading(true);
    try {
      const incoming = await fetchRef.current(page);
      const known = new Set((page === 1 ? [] : stateRef.current?.videos || []).map((video) => video.id));
      const fresh = incoming.filter((video) => !known.has(video.id));
      const videos = page === 1 ? fresh : [...(stateRef.current?.videos || []), ...fresh];
      commit({ videos, page, hasMore: incoming.length >= pageSize });
      setError(null);
    } catch (reason) {
      console.error('Feed failed', key, reason);
      setError(t('Failed to load videos'));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [commit, key, pageSize]);

  useEffect(() => {
    if (!restore(key) && !(known && !known.stale)) void load(1);
  }, [key, load, known]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (current && current.hasMore && !busyRef.current) void load(current.page + 1);
  }, [load]);

  return {
    videos: state?.videos ?? [],
    loading: loading && !state,
    loadingMore: loading && Boolean(state),
    error,
    loadMore,
  };
}
