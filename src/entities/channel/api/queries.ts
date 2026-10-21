import { lbryRpc, query, PRIORITY_BACKGROUND } from '@/shared/api';
import { parseChannel } from '../model/parse';
import type { Channel, RawChannelClaim } from '../model/types';

export function resolveChannels(claimIds: string[]): Promise<Channel[]> {
  if (claimIds.length === 0) return Promise.resolve([]);
  const key = `channels:${claimIds.slice().sort().join('_')}`;
  return query(key, async () => {
    const result = await lbryRpc<{ items?: RawChannelClaim[] }>('claim_search', {
      claim_ids: claimIds,
      claim_type: ['channel'],
      page_size: claimIds.length,
      no_totals: true,
    }, PRIORITY_BACKGROUND);
    return (result.items || []).map(parseChannel);
  }, { ttl: 10 * 60 * 1000 });
}
