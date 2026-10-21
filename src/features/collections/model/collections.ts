import { STORAGE } from '@/shared/config';
import { createStore, readJson, writeJson, removeKey } from '@/shared/lib';
import { normalizeVideos, resolveVideos, type Video } from '@/entities/video';
import { getPreferences, updatePreferences, isLoggedIn } from '@/entities/session';

export type CollectionKind = 'watchLater' | 'favorites' | 'history';

const KEYS: Record<CollectionKind, string> = {
  watchLater: STORAGE.WATCH_LATER,
  favorites: STORAGE.FAVORITES,
  history: STORAGE.WATCH_HISTORY,
};
const CLOUD_KEYS = { watchLater: 'watchlater', favorites: 'favorites' } as const;
const MAX_HISTORY = 200;
const MAX_CLOUD_ITEMS = 50;
const WRITE_DELAY = 500;

type Lists = Record<CollectionKind, Video[]>;

const load = (kind: CollectionKind) => normalizeVideos(readJson<unknown>(KEYS[kind], []));

export const collections = createStore<Lists>({ watchLater: load('watchLater'), favorites: load('favorites'), history: load('history') });

const timers: Partial<Record<CollectionKind, ReturnType<typeof setTimeout>>> = {};

function flush(kind: CollectionKind) {
  clearTimeout(timers[kind]);
  delete timers[kind];
  writeJson(KEYS[kind], collections.get()[kind]);
}

export function flushCollections() {
  (Object.keys(timers) as CollectionKind[]).forEach(flush);
}

function setList(kind: CollectionKind, videos: Video[]) {
  collections.set((lists) => ({ ...lists, [kind]: videos }));
  clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => flush(kind), WRITE_DELAY);
}

export const useCollections = collections.use;
export const inCollection = (kind: CollectionKind, id: string) => collections.get()[kind].some((video) => video.id === id);

const claimUri = (video: Video) => `lbry://${video.claimName}#${video.id}`;
const claimIdOf = (uri: string) => (uri.includes('#') ? uri.substring(uri.lastIndexOf('#') + 1) : null);

function pushToCloud(kind: 'watchLater' | 'favorites', change: (items: string[]) => string[]) {
  if (!isLoggedIn()) return;
  const key = CLOUD_KEYS[kind];
  void updatePreferences((shared) => {
    const builtin = shared.builtinCollections || {};
    const items = change(builtin[key]?.items || []);
    return { ...shared, builtinCollections: { ...builtin, [key]: { ...builtin[key], items, itemCount: items.length, updatedAt: Date.now() } } };
  });
}

export function addToCollection(kind: 'watchLater' | 'favorites', video: Video) {
  if (inCollection(kind, video.id)) return;
  setList(kind, [video, ...collections.get()[kind]]);
  pushToCloud(kind, (items) => (items.some((item) => item.includes(video.id)) ? items : [claimUri(video), ...items]));
}

export function removeFromCollection(kind: 'watchLater' | 'favorites', id: string) {
  if (!inCollection(kind, id)) return;
  setList(kind, collections.get()[kind].filter((video) => video.id !== id));
  pushToCloud(kind, (items) => items.filter((item) => !item.includes(id)));
}

export function toggleInCollection(kind: 'watchLater' | 'favorites', video: Video) {
  if (inCollection(kind, video.id)) removeFromCollection(kind, video.id);
  else addToCollection(kind, video);
}

export function addToHistory(video: Video) {
  const rest = collections.get().history.filter((entry) => entry.id !== video.id);
  setList('history', [video, ...rest].slice(0, MAX_HISTORY));
}

export function clearCollections(kinds: CollectionKind[] = ['watchLater', 'favorites', 'history']) {
  kinds.forEach((kind) => {
    clearTimeout(timers[kind]);
    delete timers[kind];
    removeKey(KEYS[kind]);
  });
  collections.set((lists) => ({ ...lists, ...Object.fromEntries(kinds.map((kind) => [kind, []])) }));
}

export async function syncCollections(kinds: ('watchLater' | 'favorites')[] = ['watchLater', 'favorites']) {
  const preferences = await getPreferences();
  const builtin = preferences?.builtinCollections;
  if (!builtin) return;
  const wanted = kinds.map((kind) => ({
    kind,
    ids: (builtin[CLOUD_KEYS[kind]]?.items || []).map(claimIdOf).filter((id): id is string => id !== null).slice(0, MAX_CLOUD_ITEMS),
  }));
  const unique = Array.from(new Set(wanted.flatMap((entry) => entry.ids)));
  let videos: Video[];
  try {
    videos = await resolveVideos(unique);
  } catch (error) {
    console.error('Failed to resolve synced collections', error);
    return;
  }
  const byId = new Map(videos.map((video) => [video.id, video]));
  wanted.forEach(({ kind, ids }) => {
    setList(kind, ids.map((id) => byId.get(id)).filter((video): video is Video => video !== undefined));
  });
}
