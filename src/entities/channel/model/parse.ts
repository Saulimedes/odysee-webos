import type { Channel, RawChannelClaim } from './types';

export function parseChannel(claim: RawChannelClaim): Channel {
  const value = claim.value || {};
  const name = claim.name ? claim.name.replace('@', '') : 'Unknown';
  return {
    id: claim.claim_id,
    name,
    title: value.title || name,
    description: value.description || '',
    thumb: value.thumbnail?.url || `https://thumbnails.lbry.com/${claim.claim_id}`,
  };
}
