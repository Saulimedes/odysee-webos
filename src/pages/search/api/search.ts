import { lighthouseSearch } from '@/shared/api';
import { resolveVideos, type Video } from '@/entities/video';
import { resolveChannels, type Channel } from '@/entities/channel';
import { DEFAULT_FILTERS, filterParams, type SearchFilters } from '../model/filters';

export const SEARCH_PAGE = 40;

function lighthouse(text: string, from: number, extra: Record<string, string>): Promise<string[]> {
  return lighthouseSearch(text, { size: String(SEARCH_PAGE), ...(from > 0 ? { from: String(from) } : {}), ...extra });
}

export interface SearchPage<T> { items: T[]; count: number }

const NONE: SearchPage<never> = { items: [], count: 0 };

// Lighthouse only names the claims and a second request fetches them, skipped when the text has moved on
export async function searchVideoPage(text: string, from: number, isCurrent: () => boolean = () => true, filters: SearchFilters = DEFAULT_FILTERS): Promise<SearchPage<Video>> {
  const ids = await lighthouse(text, from, { claimType: 'file', mediaType: 'video', ...filterParams(filters) });
  if (!isCurrent()) return NONE;
  return { items: await resolveVideos(ids), count: ids.length };
}

export async function searchChannelPage(text: string, from: number, isCurrent: () => boolean = () => true): Promise<SearchPage<Channel>> {
  const ids = await lighthouse(text, from, { claimType: 'channel' });
  if (!isCurrent()) return NONE;
  return { items: await resolveChannels(ids), count: ids.length };
}
