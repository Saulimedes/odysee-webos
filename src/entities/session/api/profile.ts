import { lbryRpcAuthenticated } from '@/shared/api';
import { getToken, isLoggedIn, updateUser, type ProfileChannel } from '../model/store';
import { getPreferences } from './preferences';

interface OwnChannel { claim_id: string; name?: string; value?: { thumbnail?: { url?: string } } }

export async function loadProfile(): Promise<ProfileChannel | null> {
  const token = getToken();
  if (!token || !isLoggedIn()) return null;
  try {
    const [preferences, result] = await Promise.all([
      getPreferences(),
      lbryRpcAuthenticated<{ items?: OwnChannel[] }>('claim_list', { claim_type: ['channel'], page: 1, page_size: 50, resolve: true }, token),
    ]);
    const channels = (result.items || []).map((claim): ProfileChannel => ({
      id: claim.claim_id,
      name: claim.name ? claim.name.replace('@', '') : 'channel',
      thumb: claim.value?.thumbnail?.url || `https://thumbnails.lbry.com/${claim.claim_id}`,
    }));
    if (channels.length === 0) return null;
    const preferred = preferences?.settings?.active_channel_claim;
    const channel = channels.find((candidate) => candidate.id === preferred) || channels[0];
    updateUser({ channel, profile_image: channel.thumb });
    return channel;
  } catch (error) {
    console.error('Failed to load profile', error);
    return null;
  }
}
