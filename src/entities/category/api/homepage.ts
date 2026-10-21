import { CONTENT_API_URL } from '@/shared/config';
import { getJson, peek, query, invalidate } from '@/shared/api';
import { createStore } from '@/shared/lib';
import type { Category, ContentResponse, Homepage, RawCategory } from '../model/types';

const KEY = 'homepage';
const OPTIONS = { ttl: 6 * 60 * 60 * 1000, persist: true };
const MAX_CHANNELS = 100;
const FEATURED_ID = 'PRIMARY_CONTENT';

export function parseCategory(id: string, raw: RawCategory): Category | null {
  if (!raw.channelIds || raw.channelIds.length === 0) return null;
  return {
    id,
    label: id === FEATURED_ID ? 'Featured' : raw.label || raw.name || id,
    icon: raw.icon || '',
    channelIds: raw.channelIds.slice(0, MAX_CHANNELS),
    pageSize: raw.pageSize || 20,
    days: raw.daysOfContent || 90,
    sortOrder: raw.sortOrder || 999,
  };
}

export function parseHomepage(response: ContentResponse): Homepage {
  const raw = response.data?.en?.categories;
  if (response.status !== 'success' || !raw) throw new Error('Homepage content unavailable');
  let featured: Category | null = null;
  const categories: Category[] = [];
  for (const [id, entry] of Object.entries(raw)) {
    const category = parseCategory(id, entry);
    if (!category) continue;
    if (id === FEATURED_ID) featured = category;
    else categories.push(category);
  }
  categories.sort((a, b) => a.sortOrder - b.sortOrder);
  return { featured, categories };
}

const homepage = createStore<Homepage | null>(peek<Homepage>(KEY, OPTIONS)?.value ?? null);

export const useHomepage = homepage.use;

export async function refreshHomepage(force = false): Promise<Homepage | null> {
  if (force) invalidate(KEY);
  try {
    const next = await query(KEY, async () => parseHomepage(await getJson<ContentResponse>(CONTENT_API_URL)), OPTIONS);
    homepage.set(next);
    return next;
  } catch (error) {
    console.error('Failed to load homepage categories', error);
    return homepage.get();
  }
}
