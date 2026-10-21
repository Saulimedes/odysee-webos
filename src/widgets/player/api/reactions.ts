import { ODYSEE_API_URL } from '@/shared/config';
import { getJson, postForm, query, invalidate } from '@/shared/api';
import { getToken, isLoggedIn } from '@/entities/session';

export type Reaction = 'like' | 'dislike';
export interface Reactions { likes: number; dislikes: number; mine: Reaction | null }

const EMPTY: Reactions = { likes: 0, dislikes: 0, mine: null };
const keyFor = (claimId: string) => `reactions:${claimId}:${getToken() ? 'auth' : 'anon'}`;

interface ListResponse {
  success?: boolean;
  data?: { reactions?: Record<string, { like?: number; dislike?: number }>; my_reactions?: Record<string, Reaction> };
}

export async function getReactions(claimId: string): Promise<Reactions> {
  try {
    return await query(keyFor(claimId), async () => {
      const params = new URLSearchParams({ claim_ids: claimId });
      const token = getToken();
      if (token) params.append('auth_token', token);
      const body = await getJson<ListResponse>(`${ODYSEE_API_URL}/reaction/list?${params}`);
      const counts = body.data?.reactions?.[claimId];
      if (!body.success || !counts) return EMPTY;
      return { likes: counts.like || 0, dislikes: counts.dislike || 0, mine: body.data?.my_reactions?.[claimId] || null };
    }, { ttl: 10 * 60 * 1000 });
  } catch (error) {
    console.error('Failed to load reactions', error);
    return EMPTY;
  }
}

export async function setReaction(claimId: string, type: Reaction, remove: boolean) {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  const data: Record<string, string> = { auth_token: token, claim_ids: claimId, type };
  if (remove) data.remove = 'true';
  else data.clear_types = type === 'like' ? 'dislike' : 'like';
  try {
    const { body } = await postForm<{ success?: boolean }>(`${ODYSEE_API_URL}/reaction/react`, data);
    invalidate(`reactions:${claimId}`);
    return Boolean(body.success);
  } catch (error) {
    console.error('Failed to update reaction', error);
    return false;
  }
}
