import { EXCLUDED_TAGS, getSetting } from '@/shared/config';
import { lbryRpc, peek, query, PRIORITY_BACKGROUND, PRIORITY_FOREGROUND } from '@/shared/api';
import { parseClaim } from '../model/claim';
import type { RawClaim, Video } from '../model/types';

export const DEFAULT_PAGE_SIZE = 20;
const TTL = 5 * 60 * 1000;
const DAY = 86400;
const HOUR = 3600;

export interface FeedQuery {
  channelIds?: string[];
  excludedChannelIds?: string[];
  claimIds?: string[];
  order?: 'trending' | 'new' | 'top';
  days?: number;
  page?: number;
  pageSize?: number;
  limitPerChannel?: number;
  excludeShorts?: boolean;
  languages?: string[];
}

export interface QueryOptions { persist?: boolean; background?: boolean }

const ORDER_BY = {
  trending: ['trending_group', 'trending_mixed'],
  new: ['release_time'],
  top: ['effective_amount'],
};

function hash(text: string) {
  let value = 0;
  for (let index = 0; index < text.length; index++) value = ((value << 5) - value + text.charCodeAt(index)) | 0;
  return Math.abs(value).toString(36);
}

export function buildParams(feed: FeedQuery) {
  const pageSize = feed.pageSize || feed.claimIds?.length || DEFAULT_PAGE_SIZE;
  const params: Record<string, unknown> = {
    page_size: pageSize,
    page: feed.page || 1,
    no_totals: true,
    stream_types: ['video'],
  };
  if (!getSetting('nsfw')) params.not_tags = EXCLUDED_TAGS;
  if (feed.claimIds) {
    params.claim_ids = feed.claimIds;
    return params;
  }
  params.claim_type = ['stream'];
  params.fee_amount = '<=0';
  params.order_by = ORDER_BY[feed.order || 'trending'];
  params.has_source = true;
  if (feed.channelIds) params.channel_ids = feed.channelIds;
  if (feed.excludedChannelIds && feed.excludedChannelIds.length > 0) params.not_channel_ids = feed.excludedChannelIds;
  // To the full hour like Odysee, so a repeated query is answered from the server's cache
  if (feed.days) params.release_time = `>${Math.floor((Date.now() / 1000 - feed.days * DAY) / HOUR) * HOUR}`;
  if (feed.limitPerChannel) params.limit_claims_per_channel = feed.limitPerChannel;
  if (feed.excludeShorts) params.exclude_shorts = true;
  if (feed.languages && feed.languages.length > 0) params.any_languages = feed.languages;
  return params;
}

const channelKeys = new WeakMap<string[], string>();

function channelsKey(ids: string[] | undefined) {
  if (!ids) return '';
  let key = channelKeys.get(ids);
  if (key === undefined) {
    key = hash(ids.join(','));
    channelKeys.set(ids, key);
  }
  return key;
}

const cacheKey = (feed: FeedQuery) => `claims:${hash(JSON.stringify([
  channelsKey(feed.channelIds), channelsKey(feed.excludedChannelIds), feed.claimIds, feed.order, feed.days, feed.page, feed.pageSize,
  feed.limitPerChannel, feed.excludeShorts, feed.languages, getSetting('nsfw'),
]))}`;

export function peekClaims(feed: FeedQuery): { videos: Video[]; stale: boolean } | undefined {
  const hit = peek<Video[]>(cacheKey(feed), { ttl: TTL, persist: true });
  return hit ? { videos: hit.value, stale: hit.stale } : undefined;
}

export function queryClaims(feed: FeedQuery, { persist = false, background = false }: QueryOptions = {}): Promise<Video[]> {
  if (feed.claimIds && feed.claimIds.length === 0) return Promise.resolve([]);
  const params = buildParams(feed);
  return query(cacheKey(feed), async () => {
    const result = await lbryRpc<{ items?: RawClaim[] }>('claim_search', params, background ? PRIORITY_BACKGROUND : PRIORITY_FOREGROUND);
    return (result.items || []).map(parseClaim);
  }, { ttl: TTL, persist });
}

export async function resolveVideos(claimIds: string[]): Promise<Video[]> {
  if (claimIds.length === 0) return [];
  const videos = await queryClaims({ claimIds });
  const byId = new Map(videos.map((video) => [video.id, video]));
  return claimIds.map((id) => byId.get(id)).filter((video): video is Video => video !== undefined);
}
