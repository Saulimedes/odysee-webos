import type { RawCategory } from '../model/types';

const DAY_MS = 86400000;

export const MAX_CHANNELS = 300;

export function sampleChannels(ids: string[], now = Date.now(), max = MAX_CHANNELS): string[] {
  if (ids.length <= max) return ids;
  const start = (Math.floor(now / DAY_MS) * max) % ids.length;
  const end = start + max;
  return end <= ids.length ? ids.slice(start, end) : ids.slice(start).concat(ids.slice(0, end - ids.length));
}

export function limitPerChannel(limit: RawCategory['channelLimit'], channelCount: number): number | undefined {
  if (limit === 'auto') return channelCount < 250 ? (channelCount < 150 ? 3 : 2) : 1;
  const count = Math.floor(Number(limit));
  return count > 0 ? count : undefined;
}
