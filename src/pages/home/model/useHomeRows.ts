import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { peekClaims, queryClaims, type FeedQuery, type Video } from '@/entities/video';
import { categoryFeed } from '@/features/browse-feeds';
import { useHomepage, useHomepageFailed, type Category } from '@/entities/category';
import { useSession } from '@/entities/session';
import { getFollowingVideos } from '@/features/following';
import { progressPercent, usePlaybackHistory } from '@/features/playback-history';
import type { VideoRow } from '@/widgets/video-rows';

interface RowState { videos: Video[]; status: VideoRow['status']; page: number; hasMore: boolean; stale: boolean }

interface Descriptor { id: string; title: string; icon?: string | null; pageSize: number; feed?: (page: number) => FeedQuery }

const FOLLOWING_ID = 'following';
const EMPTY_ROW: RowState = { videos: [], status: 'idle', page: 0, hasMore: false, stale: false };
const PREFETCH_AHEAD = 3;
const MAX_ROW_ITEMS = 48;

function describe(featured: Category | null, categories: Category[], loggedIn: boolean): Descriptor[] {
  const list: Descriptor[] = [];
  if (loggedIn) list.push({ id: FOLLOWING_ID, title: 'Following', icon: null, pageSize: 20 });
  [featured, ...categories].forEach((category) => {
    if (category) list.push({ id: category.id, title: category.label, icon: category.icon || category.label, pageSize: category.pageSize, feed: (page) => categoryFeed(category, page) });
  });
  return list;
}

function cached(descriptor: Descriptor): RowState | null {
  if (!descriptor.feed) return null;
  const hit = peekClaims(descriptor.feed(1));
  return hit ? { videos: hit.videos, status: 'ready', page: 1, hasMore: hit.videos.length >= descriptor.pageSize, stale: hit.stale } : null;
}

export function useHomeRows() {
  const homepage = useHomepage();
  const failed = useHomepageFailed();
  const { user } = useSession();
  const history = usePlaybackHistory();
  const loggedIn = Boolean(user?.primary_email);
  const descriptors = useMemo(() => describe(homepage?.featured ?? null, homepage?.categories ?? [], loggedIn), [homepage, loggedIn]);
  const descriptorsRef = useRef(descriptors);
  descriptorsRef.current = descriptors;

  const [data, setData] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    descriptors.forEach((descriptor) => {
      const hit = cached(descriptor);
      if (hit) initial[descriptor.id] = hit;
    });
    return initial;
  });
  const busy = useRef(new Set<string>());
  const dataRef = useRef(data);
  dataRef.current = data;

  const patch = useCallback((id: string, next: Partial<RowState>) => {
    setData((previous) => ({ ...previous, [id]: { ...EMPTY_ROW, ...previous[id], ...next } }));
  }, []);

  const fetchPage = useCallback(async (descriptor: Descriptor, page: number, background: boolean) => {
    if (descriptor.feed) return queryClaims(descriptor.feed(page), { persist: page === 1, background });
    return getFollowingVideos(page, descriptor.pageSize);
  }, []);

  const load = useCallback(async (descriptor: Descriptor, page: number, background: boolean) => {
    const token = `${descriptor.id}:${page}`;
    if (busy.current.has(token)) return;
    busy.current.add(token);
    const existing = dataRef.current[descriptor.id];
    if (!existing || existing.videos.length === 0) patch(descriptor.id, { status: 'loading' });
    try {
      const incoming = await fetchPage(descriptor, page, background);
      setData((previous) => {
        const current = previous[descriptor.id];
        const known = new Set(page === 1 ? [] : (current?.videos || []).map((video) => video.id));
        const merged = page === 1 ? incoming : [...(current?.videos || []), ...incoming.filter((video) => !known.has(video.id))];
        return { ...previous, [descriptor.id]: { videos: merged, status: 'ready', page, hasMore: incoming.length >= descriptor.pageSize && merged.length < MAX_ROW_ITEMS, stale: false } };
      });
    } catch (error) {
      console.error('Row failed', descriptor.id, error);
      if (!dataRef.current[descriptor.id]?.videos.length) patch(descriptor.id, { status: 'error' });
    } finally {
      busy.current.delete(token);
    }
  }, [fetchPage, patch]);

  useEffect(() => {
    setData((previous) => {
      const next = { ...previous };
      descriptors.forEach((descriptor) => {
        if (!next[descriptor.id]) {
          const hit = cached(descriptor);
          if (hit) next[descriptor.id] = hit;
        }
      });
      Object.keys(next).forEach((id) => { if (!descriptors.some((descriptor) => descriptor.id === id)) delete next[id]; });
      return next;
    });
  }, [descriptors]);

  const ensure = useCallback((rowId: string) => {
    const list = descriptorsRef.current;
    const at = Math.max(0, list.findIndex((descriptor) => descriptor.id === rowId));
    list.slice(at, at + PREFETCH_AHEAD + 1).forEach((descriptor, offset) => {
      const state = dataRef.current[descriptor.id];
      if (!state || state.status === 'idle' || state.status === 'error' || state.stale) void load(descriptor, 1, offset > 1);
    });
  }, [load]);

  useEffect(() => {
    if (descriptors.length > 0) ensure(descriptors[0].id);
  }, [descriptors, ensure]);

  const loadMore = useCallback((rowId: string) => {
    const descriptor = descriptorsRef.current.find((candidate) => candidate.id === rowId);
    const state = dataRef.current[rowId];
    if (descriptor && state?.hasMore) void load(descriptor, state.page + 1, false);
  }, [load]);

  const rows = useMemo<VideoRow[]>(() => {
    const percent = new Map(history.map((item) => [item.video.id, progressPercent(item)]));
    const list: VideoRow[] = [];
    if (history.length > 0) {
      list.push({ id: 'continue', title: 'Continue Watching', videos: history.map((item) => item.video), status: 'ready', progress: (video) => percent.get(video.id) || 0 });
    }
    descriptors.forEach((descriptor) => {
      const state = data[descriptor.id];
      list.push({
        id: descriptor.id,
        title: descriptor.title,
        icon: descriptor.icon,
        videos: state?.videos ?? [],
        status: state?.status ?? 'idle',
        hasMore: state?.hasMore,
        progress: (video) => percent.get(video.id) || 0,
      });
    });
    return list;
  }, [descriptors, data, history]);

  const hasVideos = rows.some((row) => row.videos.length > 0);
  const loading = !hasVideos && ((homepage === null && !failed) || rows.some((row) => row.status === 'idle' || row.status === 'loading'));
  return { rows, ensure, loadMore, hasVideos, loading, failed: failed && homepage === null };
}
