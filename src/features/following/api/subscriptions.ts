import { LBRY_COM_URL } from '@/shared/config';
import { postForm, query, invalidate } from '@/shared/api';
import { getToken, getPreferences, updatePreferences, isLoggedIn } from '@/entities/session';
import { queryClaims, type Video } from '@/entities/video';

export interface Subscription { claim_id: string; channel_name?: string }

const KEY = 'acct:subscriptions';
const MAX_CHANNELS = 100;

export async function getSubscriptions(): Promise<Subscription[]> {
  const token = getToken();
  if (!token || !isLoggedIn()) return [];
  try {
    return await query(KEY, async () => {
      const { body } = await postForm<{ success?: boolean; data?: Subscription[] }>(`${LBRY_COM_URL}/subscription/list`, { auth_token: token });
      if (!body.success || !body.data) throw new Error('Subscriptions unavailable');
      return body.data;
    }, { ttl: 5 * 60 * 1000 });
  } catch (error) {
    console.error('Failed to get subscriptions', error);
    return [];
  }
}

export async function getFollowingVideos(page = 1, pageSize = 20): Promise<Video[]> {
  const channelIds = (await getSubscriptions()).map((sub) => sub.claim_id).filter(Boolean).slice(0, MAX_CHANNELS);
  if (channelIds.length === 0) return [];
  return queryClaims({ channelIds, order: 'new', days: 90, page, pageSize });
}

export async function isFollowing(channelId: string) {
  const preferences = await getPreferences();
  return Boolean(preferences?.following?.some((entry) => entry.uri.includes(channelId)));
}

export async function setFollowing(channelId: string, channelName: string, follow: boolean) {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  try {
    const path = follow ? 'new' : 'delete';
    const data: Record<string, string> = { auth_token: token, claim_id: channelId };
    if (follow) data.channel_name = channelName;
    const { body } = await postForm<{ success?: boolean }>(`${LBRY_COM_URL}/subscription/${path}`, data);
    if (body.success === false) return false;
    invalidate(KEY);
    await updatePreferences((shared) => {
      const following = shared.following || [];
      const others = following.filter((entry) => !entry.uri.includes(channelId));
      return { ...shared, following: follow ? [...others, { notificationsDisabled: true, uri: `lbry://${channelName}#${channelId}` }] : others };
    });
    return true;
  } catch (error) {
    console.error('Failed to update follow state', error);
    return false;
  }
}
