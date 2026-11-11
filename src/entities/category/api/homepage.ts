import { CONTENT_API_URL, getSetting } from '@/shared/config';
import { resolveLanguage } from '@/shared/i18n';
import { getJson, peek, query, invalidate } from '@/shared/api';
import { createStore } from '@/shared/lib';
import { limitPerChannel, sampleChannels } from '../lib/channels';
import type { Category, CategoryOrder, ContentResponse, Homepage, RawCategory } from '../model/types';

const KEY = 'homepage';
const keyFor = (language: string) => (language === 'en' ? KEY : `${KEY}:${language}`);
const OPTIONS = { ttl: 6 * 60 * 60 * 1000, persist: true };
const FEATURED_ID = 'PRIMARY_CONTENT';
const HOMEPAGE_CODES = ['en', 'fr', 'es', 'de', 'it', 'zh', 'ru', 'hi', 'pt-BR'];

const ORDERS: CategoryOrder[] = ['trending', 'new', 'top'];

export function parseCategory(id: string, raw: RawCategory, now = Date.now()): Category | null {
  const channels = raw.channelIds ?? [];
  const excluded = raw.excludedChannelIds ?? [];
  if (channels.length === 0 && excluded.length === 0) return null;
  return {
    id,
    label: id === FEATURED_ID ? 'Featured' : raw.label || raw.name || id,
    icon: raw.icon || '',
    channelIds: sampleChannels(channels, now),
    excludedChannelIds: channels.length === 0 ? excluded : undefined,
    pageSize: raw.pageSize || 20,
    days: raw.daysOfContent || 30,
    sortOrder: raw.sortOrder || 999,
    order: ORDERS.find((order) => order === raw.order) ?? 'trending',
    limitPerChannel: limitPerChannel(raw.channelLimit, channels.length),
    excludeShorts: raw.exclude_shorts === true,
    languages: raw.searchLanguages && raw.searchLanguages.length > 0 ? raw.searchLanguages : undefined,
  };
}

export function homepageLanguage() {
  const chosen = getSetting('homepageLanguage');
  const app = resolveLanguage(getSetting('uiLanguage'));
  const wanted = chosen !== 'auto' ? chosen : app === 'pt' ? 'pt-BR' : app;
  return HOMEPAGE_CODES.includes(wanted) ? wanted : 'en';
}

export function parseHomepage(response: ContentResponse, language = 'en'): Homepage {
  const raw = (response.data?.[language] ?? response.data?.en)?.categories;
  if (response.status !== 'success' || !raw) throw new Error('Homepage content unavailable');
  let featured: Category | null = null;
  const categories: Category[] = [];
  const open: Category[] = [];
  for (const [id, entry] of Object.entries(raw)) {
    const category = parseCategory(id, entry);
    if (!category) continue;
    if (id === FEATURED_ID) featured = category;
    else if (category.channelIds.length === 0) open.push(category);
    else categories.push(category);
  }
  const bySortOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder;
  return { featured, categories: categories.sort(bySortOrder), open: open.sort(bySortOrder) };
}

const homepage = createStore<Homepage | null>(peek<Homepage>(keyFor(homepageLanguage()), OPTIONS)?.value ?? null);
const failed = createStore(false);

export const useHomepage = homepage.use;
export const useHomepageFailed = failed.use;

export async function refreshHomepage(force = false): Promise<Homepage | null> {
  const language = homepageLanguage();
  const key = keyFor(language);
  if (force) invalidate(key);
  try {
    const next = await query(key, async () => parseHomepage(await getJson<ContentResponse>(`${CONTENT_API_URL}?hp=${language}`), language), OPTIONS);
    if (language === homepageLanguage()) {
      homepage.set(next);
      failed.set(false);
    }
    return next;
  } catch (error) {
    console.error('Failed to load homepage categories', error);
    if (language === homepageLanguage()) failed.set(true);
    return homepage.get();
  }
}

export function switchHomepageLanguage() {
  homepage.set(peek<Homepage>(keyFor(homepageLanguage()), OPTIONS)?.value ?? null);
  failed.set(false);
  return refreshHomepage();
}
