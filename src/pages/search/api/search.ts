import { LIGHTHOUSE_URL, getSetting } from '@/shared/config';
import { getJson, query } from '@/shared/api';
import { resolveVideos, type Video } from '@/entities/video';
import { resolveChannels, type Channel } from '@/entities/channel';

export const SEARCH_PAGE = 40;

interface Hit { claimId: string }

function lighthouse(text: string, from: number, extra: Record<string, string>): Promise<string[]> {
  const nsfw = getSetting('nsfw') ? 'true' : 'false';
  const params = new URLSearchParams({ s: text, size: String(SEARCH_PAGE), nsfw, ...extra });
  if (from > 0) params.set('from', String(from));
  const url = `${LIGHTHOUSE_URL}?${params}`;
  return query(`search:${url}`, async () => {
    const hits = await getJson<Hit[]>(url);
    return Array.isArray(hits) ? hits.map((hit) => hit.claimId) : [];
  }, { ttl: 2 * 60 * 1000 });
}

export interface SearchPage<T> { items: T[]; count: number }

const NONE: SearchPage<never> = { items: [], count: 0 };

// Lighthouse only names the claims and a second request fetches them, skipped when the text has moved on
export async function searchVideoPage(text: string, from: number, isCurrent: () => boolean = () => true): Promise<SearchPage<Video>> {
  const ids = await lighthouse(text, from, { claimType: 'file', mediaType: 'video' });
  if (!isCurrent()) return NONE;
  return { items: await resolveVideos(ids), count: ids.length };
}

export async function searchChannelPage(text: string, from: number, isCurrent: () => boolean = () => true): Promise<SearchPage<Channel>> {
  const ids = await lighthouse(text, from, { claimType: 'channel' });
  if (!isCurrent()) return NONE;
  return { items: await resolveChannels(ids), count: ids.length };
}
