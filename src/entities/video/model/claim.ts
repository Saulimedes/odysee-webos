import type { RawClaim, Video } from './types';

export function parseClaim(claim: RawClaim): Video {
  const value = claim.value || {};
  const channel = claim.signing_channel || {};
  const channelName = channel.name ? channel.name.replace('@', '') : 'Anonymous';
  return {
    id: claim.claim_id,
    title: value.title || claim.name || 'Untitled',
    thumb: value.thumbnail?.url || null,
    duration: value.video?.duration || 0,
    height: value.video?.height || 0,
    releaseTime: Number(value.release_time) || claim.timestamp || 0,
    channelId: channel.claim_id,
    channelName,
    channelTitle: channel.value?.title || channelName,
    channelThumb: channel.value?.thumbnail?.url,
    claimName: claim.name,
    size: Number(value.source?.size) || undefined,
    mediaType: value.source?.media_type,
    sdHash: value.source?.sd_hash,
  };
}

type Stored = Partial<Video> & { thumbnail?: string; channelThumbnail?: string; _claimName?: string };

export function normalizeVideo(raw: unknown): Video | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = raw as Stored;
  if (typeof stored.id !== 'string' || !stored.id) return null;
  const claimName = stored.claimName || stored._claimName;
  if (!claimName) return null;
  return {
    id: stored.id,
    title: stored.title || 'Untitled',
    thumb: stored.thumb || stored.thumbnail || null,
    duration: Number(stored.duration) || 0,
    height: Number(stored.height) || 0,
    releaseTime: Number(stored.releaseTime) || 0,
    channelId: stored.channelId,
    channelName: stored.channelName || 'Anonymous',
    channelTitle: stored.channelTitle || stored.channelName || 'Anonymous',
    channelThumb: stored.channelThumb || stored.channelThumbnail,
    claimName,
    size: Number(stored.size) || undefined,
    mediaType: typeof stored.mediaType === 'string' ? stored.mediaType : undefined,
    sdHash: typeof stored.sdHash === 'string' && stored.sdHash ? stored.sdHash : undefined,
  };
}

export function normalizeVideos(raw: unknown): Video[] {
  return Array.isArray(raw) ? raw.map(normalizeVideo).filter((video): video is Video => video !== null) : [];
}
