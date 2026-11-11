import { LIGHTHOUSE_URL, getSetting } from '@/shared/config';
import { getJson } from './http';
import { query } from './cache';

interface Hit { claimId: string }

export function lighthouseSearch(text: string, params: Record<string, string>): Promise<string[]> {
  const nsfw = getSetting('nsfw') ? 'true' : 'false';
  const url = `${LIGHTHOUSE_URL}?${new URLSearchParams({ s: text, nsfw, ...params })}`;
  return query(`search:${url}`, async () => {
    const hits = await getJson<Hit[]>(url);
    return Array.isArray(hits) ? hits.map((hit) => hit.claimId) : [];
  }, { ttl: 2 * 60 * 1000 });
}
