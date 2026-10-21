import { lbryRpcAuthenticated } from '@/shared/api';
import { getPreferences, getToken, isLoggedIn, type CollectionData } from '@/entities/session';

export interface Playlist {
  id: string;
  name: string;
  itemIds: string[];
  published: boolean;
  updatedAt: number;
}

interface CollectionClaim { claim_id: string; name: string; value?: { title?: string; claims?: string[] } }

export const claimIdOf = (item: string) => (item.startsWith('lbry://') ? item.substring(item.lastIndexOf('#') + 1) : item);

const fromCollection = (id: string, data: CollectionData, published: boolean): Playlist => ({
  id,
  name: data.name || id,
  itemIds: (data.items || []).map(claimIdOf).filter(Boolean),
  published,
  updatedAt: data.updatedAt || 0,
});

export async function loadPlaylists(): Promise<Playlist[]> {
  const token = getToken();
  if (!token || !isLoggedIn()) return [];
  const byId = new Map<string, Playlist>();

  try {
    const result = await lbryRpcAuthenticated<{ items?: CollectionClaim[] }>('claim_list', { claim_type: ['collection'], page: 1, page_size: 50, resolve: true }, token);
    (result.items || []).forEach((claim) => {
      byId.set(claim.claim_id, { id: claim.claim_id, name: claim.value?.title || claim.name, itemIds: claim.value?.claims || [], published: true, updatedAt: 0 });
    });
  } catch (error) {
    console.error('Failed to load published playlists', error);
  }

  const preferences = await getPreferences();
  Object.entries(preferences?.unpublishedCollections || {}).forEach(([id, data]) => {
    if (id !== 'watchlater' && id !== 'favorites' && data?.name) byId.set(id, fromCollection(id, data, false));
  });
  Object.entries(preferences?.editedCollections || {}).forEach(([id, data]) => {
    if (data?.name) byId.set(id, fromCollection(id, data, byId.get(id)?.published ?? false));
  });

  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
