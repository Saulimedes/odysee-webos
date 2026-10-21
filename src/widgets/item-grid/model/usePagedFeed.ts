import { useCallback, useEffect, useRef, useState } from 'react';
import type { Video } from '@/entities/video';

interface FeedState { videos: Video[]; page: number; hasMore: boolean; t: number }

const FRESH_MS = 5 * 60 * 1000;
const memory = new Map<string, FeedState>();

function restore(key: string) {
  const saved = memory.get(key);
  return saved && Date.now() - saved.t < FRESH_MS ? saved : null;
}

export function usePagedFeed(key: string, fetchPage: (page: number) => Promise<Video[]>, pageSize: number) {
  const [state, setState] = useState<FeedState | null>(() => restore(key));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchPage);
  const busyRef = useRef(false);
  const stateRef = useRef(state);
  fetchRef.current = fetchPage;
  stateRef.current = state;

  const commit = useCallback((next: FeedState) => {
    memory.set(key, next);
    stateRef.current = next;
    setState(next);
  }, [key]);

  const load = useCallback(async (page: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const incoming = await fetchRef.current(page);
      const known = new Set((page === 1 ? [] : stateRef.current?.videos || []).map((video) => video.id));
      const fresh = incoming.filter((video) => !known.has(video.id));
      const videos = page === 1 ? fresh : [...(stateRef.current?.videos || []), ...fresh];
      commit({ videos, page, hasMore: incoming.length >= pageSize, t: Date.now() });
      setError(null);
    } catch (reason) {
      console.error('Feed failed', key, reason);
      setError('Failed to load videos');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [commit, key, pageSize]);

  useEffect(() => {
    if (!restore(key)) void load(1);
  }, [key, load]);

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
