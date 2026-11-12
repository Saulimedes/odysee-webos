import { createStore, readJson, removeKey, writeJson } from '@/shared/lib';

export type LayoutKind = 'home' | 'sidebar';

export interface Layout { order: string[]; hidden: string[]; shown: string[] }

interface Entry { id: string; hiddenByDefault?: boolean }

export const HOME_ROWS = { continue: 'continue', following: 'following' } as const;

const STORAGE_KEYS: Record<LayoutKind, string> = { home: 'layout_home', sidebar: 'layout_sidebar' };
const DEFAULT_LAYOUT: Layout = { order: [], hidden: [], shown: [] };

const onlyStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function load(kind: LayoutKind): Layout {
  const stored = readJson<Partial<Layout> | null>(STORAGE_KEYS[kind], null);
  return stored && typeof stored === 'object' ? { order: onlyStrings(stored.order), hidden: onlyStrings(stored.hidden), shown: onlyStrings(stored.shown) } : DEFAULT_LAYOUT;
}

const stores = { home: createStore(load('home')), sidebar: createStore(load('sidebar')) };

export const useLayout = (kind: LayoutKind) => stores[kind].use();

function save(kind: LayoutKind, layout: Layout) {
  stores[kind].set(layout);
  if (layout.order.length === 0 && layout.hidden.length === 0 && layout.shown.length === 0) removeKey(STORAGE_KEYS[kind]);
  else writeJson(STORAGE_KEYS[kind], layout);
}

export function arrange<T extends { id: string }>(items: T[], layout: Layout): T[] {
  const rank = (id: string) => {
    const at = layout.order.indexOf(id);
    return at < 0 ? layout.order.length : at;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.index - b.index)
    .map(({ item }) => item);
}

export const isHidden = (item: Entry, layout: Layout) => (item.hiddenByDefault ? !layout.shown.includes(item.id) : layout.hidden.includes(item.id));

export function visibleItems<T extends Entry>(items: T[], layout: Layout, locked: readonly string[] = []): T[] {
  return arrange(items, layout).filter((item) => locked.includes(item.id) || !isHidden(item, layout));
}

export function moveEntry(kind: LayoutKind, ids: string[], id: string, direction: -1 | 1) {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return false;
  const order = ids.slice();
  order.splice(from, 1);
  order.splice(to, 0, id);
  save(kind, { ...stores[kind].get(), order });
  return true;
}

export function toggleEntry(kind: LayoutKind, id: string, hiddenByDefault = false) {
  const current = stores[kind].get();
  const key = hiddenByDefault ? 'shown' : 'hidden';
  const list = current[key];
  save(kind, { ...current, [key]: list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id] });
}

export function resetLayout(kind: LayoutKind) {
  save(kind, DEFAULT_LAYOUT);
}
