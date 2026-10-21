import { LBRY_CDN_URL } from '@/shared/config';
import type { Video } from '../model/types';

export function streamUrl(video: Video, quality = 'auto') {
  const hash = video.hash ? video.hash.substring(0, 6) : '';
  const height = parseInt(quality, 10);
  if (quality === 'auto' || Number.isNaN(height)) return `${LBRY_CDN_URL}/api/v3/streams/free/${video.claimName}/${video.id}/${hash}`;
  return `${LBRY_CDN_URL}/api/v4/streams/tc/${video.claimName}/${video.id}/${hash}?quality=${height}p`;
}
