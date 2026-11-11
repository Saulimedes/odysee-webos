import { ODYSEE_SITE_URL, PLAYER_SERVER_URL } from '@/shared/config';
import { withTimeout } from '@/shared/api';
import { resolveVideos } from '../api/queries';
import type { Video } from '../model/types';

const PROBE_TIMEOUT_MS = 5000;
const MISSING_FOR_MS = 5 * 60 * 1000;

export type StreamSource = { kind: 'hls'; url: string; start: string } | { kind: 'file'; url: string };
type Lookup = { state: 'found'; start: string } | { state: 'missing' | 'unknown' };

const missing = new Map<string, number>();
const sdHashes = new Map<string, string>();

// The download address redirects to a signed link that a TV can play, the old LBRY player host no longer answers
export const fileUrl = (video: Video) => `${ODYSEE_SITE_URL}/$/download/${encodeURIComponent(video.claimName)}/${video.id}`;

// Odysee's own player asks for this transcoded copy (8 bit H.264, up to 1080p) before it falls back to the file
export const playlistUrl = (video: Video, sdHash: string) => `${PLAYER_SERVER_URL}/v6/streams/${video.id}/${sdHash}/master.m3u8`;

// A native player starts on the lowest rendition, which the CDN rarely holds and the origin may refuse, so it is handed the best one
export function bestVariant(master: string, base: string) {
  const lines = master.split(/\r?\n/);
  let best = { bandwidth: -1, uri: '' };
  lines.forEach((line, index) => {
    const uri = (lines[index + 1] ?? '').trim();
    const bandwidth = Number(/[:,]BANDWIDTH=(\d+)/.exec(line)?.[1]);
    if (line.startsWith('#EXT-X-STREAM-INF') && uri && !uri.startsWith('#') && bandwidth > best.bandwidth) best = { bandwidth, uri };
  });
  return best.uri ? new URL(best.uri, base).href : undefined;
}

async function sdHashOf(video: Video) {
  if (video.sdHash) return video.sdHash;
  const known = sdHashes.get(video.id);
  if (known) return known;
  try {
    const [found] = await resolveVideos([video.id]);
    if (found?.sdHash) sdHashes.set(video.id, found.sdHash);
    return found?.sdHash;
  } catch {
    return undefined;
  }
}

async function lookUp(url: string): Promise<Lookup> {
  try {
    return await withTimeout(async (signal): Promise<Lookup> => {
      const response = await fetch(url, { signal });
      if (!response.ok) return { state: response.status === 404 || response.status === 403 ? 'missing' : 'unknown' };
      const start = /mpegurl/i.test(response.headers.get('content-type') || '') ? bestVariant(await response.text(), url) : undefined;
      return start ? { state: 'found', start } : { state: 'missing' };
    }, PROBE_TIMEOUT_MS);
  } catch {
    return { state: 'unknown' };
  }
}

// The origin refuses (429) a playlist its CDN does not hold while the file still answers, so a refusal means the file, now
export async function resolveSource(video: Video): Promise<StreamSource> {
  const file: StreamSource = { kind: 'file', url: fileUrl(video) };
  const missedAt = missing.get(video.id);
  if (missedAt !== undefined && Date.now() - missedAt < MISSING_FOR_MS) return file;
  const sdHash = await sdHashOf(video);
  if (!sdHash) return file;
  const url = playlistUrl(video, sdHash);
  const found = await lookUp(url);
  if (found.state === 'found') return { kind: 'hls', url, start: found.start };
  if (found.state === 'missing') missing.set(video.id, Date.now());
  return file;
}
