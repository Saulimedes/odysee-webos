import { lighthouseSearch } from '@/shared/api';
import { queryClaims, resolveVideos } from './queries';
import type { Video } from '../model/types';

const RELATED_SIZE = '20';

async function related(video: Video) {
  const ids = await lighthouseSearch(video.title, { size: RELATED_SIZE, claimType: 'file', mediaType: 'video', free_only: 'true', related_to: video.id });
  return resolveVideos(ids.filter((id) => id !== video.id), { background: true });
}

export async function suggestedVideos(video: Video): Promise<Video[]> {
  const found = (await related(video).catch(() => [])).filter((candidate) => candidate.id !== video.id);
  if (found.length > 0 || !video.channelId) return found;
  const latest = await queryClaims({ channelIds: [video.channelId], order: 'new', days: 90, pageSize: 10 }, { background: true });
  return latest.filter((candidate) => candidate.id !== video.id);
}
