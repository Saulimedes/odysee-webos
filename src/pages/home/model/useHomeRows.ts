import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/shared/i18n';
import { peekClaims, queryClaims, type FeedQuery, type Video } from '@/entities/video';
import { categoryFeed } from '@/features/browse-feeds';
import { categoryIcon, useHomepage, useHomepageFailed, type Category, type Homepage } from '@/entities/category';
import { useSession } from '@/entities/session';
import { HOME_ROWS, useLayout, visibleItems } from '@/features/customize-layout';
import { getFollowingVideos, peekFollowingVideos } from '@/features/following';
import { progressPercent, usePlaybackHistory } from '@/features/playback-history';
import type { VideoRow } from '@/widgets/video-rows';

interface RowState { videos: Video[]; status: VideoRow['status']; page: number; hasMore: boolean; stale: boolean }

interface Descriptor { id: string; title: string; icon?: string | null; pageSize: number; feed?: (page: number) => FeedQuery; hiddenByDefault?: boolean }

const EMPTY_ROW: RowState = { videos: [], status: 'idle', page: 0, hasMore: false, stale: false };
const PREFETCH_AHEAD = 3;
const PREFETCH_BEHIND = 2;
const MAX_ROW_ITEMS = 48;
const NO_VIDEOS: Video[] = [];

function describe(homepage: Homepage | null, loggedIn: boolean): Descriptor[] {
  const list: Descriptor[] = [];
  if (loggedIn) list.push({ id: HOME_ROWS.following, title: 'Following', icon: null, pageSize: 20 });
  const add = (category: Category | null | undefined, hiddenByDefault?: boolean) => {
    if (category) list.push({ id: category.id, title: category.label, icon: categoryIcon(category), pageSize: category.pageSize, feed: (page) => categoryFeed(category, page), hiddenByDefault });
  };
  add(homepage?.featured);
  homepage?.categories.forEach((category) => add(category));
  homepage?.open?.forEach((category) => add(category, true));
  return list;
}

function cached(descriptor: Descriptor): RowState | null {
  const hit = descriptor.feed ? peekClaims(descriptor.feed(1)) : peekFollowingVideos(1, descriptor.pageSize);
  return hit ? { videos: hit.videos, status: 'ready', page: 1, hasMore: hit.videos.length >= descriptor.pageSize, stale: hit.stale } : null;
}

export function useHomeRows() {
  const t = useTranslation();
  const homepage = useHomepage();
  const failed = useHomepageFailed();
  const { user } = useSession();
  const history = usePlaybackHistory();
  const layout = useLayout('home');
  const loggedIn = Boolean(user?.primary_email);
  const descriptors = useMemo(
    () => visibleItems(describe(homepage, loggedIn), layout),
    [homepage, loggedIn, layout],
  );
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

  const wanted = useCallback((descriptor: Descriptor) => {
    const state = dataRef.current[descriptor.id];
    return !state || state.status === 'idle' || state.status === 'error' || state.stale;
  }, []);

  const ensure = useCallback((rowId: string) => {
    const list = descriptorsRef.current;
    const at = Math.max(0, list.findIndex((descriptor) => descriptor.id === rowId));
    const from = Math.max(0, at - PREFETCH_BEHIND);
    const onScreen: Array<Promise<void>> = [];
    const later: Descriptor[] = [];
    list.slice(from, at + PREFETCH_AHEAD + 1).forEach((descriptor, position) => {
      if (!wanted(descriptor)) return;
      const offset = from + position - at;
      if (offset < 0 || offset > 1 || dataRef.current[descriptor.id]?.videos.length) later.push(descriptor);
      else onScreen.push(load(descriptor, 1, false));
    });
    const start = () => later.forEach((descriptor) => { if (wanted(descriptor)) void load(descriptor, 1, true); });
    if (onScreen.length === 0) start();
    else void Promise.all(onScreen).then(start);
  }, [load, wanted]);

  useEffect(() => {
    if (descriptors.length > 0) ensure(descriptors[0].id);
  }, [descriptors, ensure]);

  const loadMore = useCallback((rowId: string) => {
    const descriptor = descriptorsRef.current.find((candidate) => candidate.id === rowId);
    const state = dataRef.current[rowId];
    if (descriptor && state?.hasMore) void load(descriptor, state.page + 1, false);
  }, [load]);

  const progress = useMemo(() => {
    const percent = new Map(history.map((item) => [item.video.id, progressPercent(item)]));
    return (video: Video) => percent.get(video.id) || 0;
  }, [history]);
  const continueVideos = useMemo(() => history.map((item) => item.video), [history]);

  const known = useRef(new Map<string, VideoRow>());
  const rows = useMemo<VideoRow[]>(() => {
    const keep = (next: VideoRow) => {
      const previous = known.current.get(next.id);
      const same = previous && previous.title === next.title && previous.icon === next.icon && previous.videos === next.videos
        && previous.status === next.status && previous.hasMore === next.hasMore && previous.progress === next.progress;
      const row = same ? previous : next;
      known.current.set(row.id, row);
      return row;
    };
    const list: VideoRow[] = descriptors.map((descriptor) => {
      const state = data[descriptor.id];
      return keep({
        id: descriptor.id,
        title: t(descriptor.title),
        icon: descriptor.icon,
        videos: state?.videos ?? NO_VIDEOS,
        status: state?.status ?? 'idle',
        hasMore: state?.hasMore,
        progress,
      });
    });
    if (history.length > 0) {
      const after = list.findIndex((row) => row.id === HOME_ROWS.following) + 1;
      list.splice(after, 0, keep({ id: HOME_ROWS.continue, title: t('Continue Watching'), videos: continueVideos, status: 'ready', progress }));
    }
    return visibleItems(list, layout);
  }, [descriptors, data, history, layout, t, progress, continueVideos]);

  const hasVideos = rows.some((row) => row.videos.length > 0);
  const loading = !hasVideos && ((homepage === null && !failed) || rows.some((row) => row.status === 'idle' || row.status === 'loading'));
  const allHidden = homepage !== null && rows.length === 0 && layout.hidden.length > 0;
  return { rows, ensure, loadMore, hasVideos, loading, allHidden, failed: failed && homepage === null };
}
