import { LBRY_CDN_URL, ODYSEE_SITE_URL } from '@/shared/config';
import type { Video } from '../model/types';

/** The /$/download address redirects to a signed link, which a TV can play. The old LBRY player host no longer answers. */
export function streamSources(video: Video, quality = 'auto'): string[] {
  const hash = video.hash ? video.hash.substring(0, 6) : '';
  const height = parseInt(quality, 10);
  const original = `${ODYSEE_SITE_URL}/$/download/${encodeURIComponent(video.claimName)}/${video.id}`;
  const legacy = `${LBRY_CDN_URL}/api/v3/streams/free/${video.claimName}/${video.id}/${hash}`;
  if (quality === 'auto' || Number.isNaN(height)) return [original, legacy];
  return [`${LBRY_CDN_URL}/api/v4/streams/tc/${video.claimName}/${video.id}/${hash}?quality=${height}p`, original, legacy];
}
