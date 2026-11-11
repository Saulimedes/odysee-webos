import { lbryRpcAuthenticated, query, store, invalidate } from '@/shared/api';
import { getToken, isLoggedIn } from '../model/store';

export interface CollectionData {
  name?: string;
  description?: string;
  thumbnail?: { url?: string };
  items?: string[];
  updatedAt?: number;
}

export interface SharedPreferences {
  builtinCollections?: Record<string, CollectionData>;
  unpublishedCollections?: Record<string, CollectionData>;
  editedCollections?: Record<string, CollectionData>;
  following?: { uri: string; notificationsDisabled?: boolean }[];
  settings?: { active_channel_claim?: string };
  [key: string]: unknown;
}

const KEY = 'acct:preferences';
const TTL = 30 * 1000;

let writes: Promise<boolean> = Promise.resolve(true);

interface PreferenceResult { shared?: SharedPreferences & { value?: SharedPreferences } }

async function fetchPreferences(): Promise<SharedPreferences> {
  const result = await lbryRpcAuthenticated<PreferenceResult>('preference_get', { key: 'shared' }, getToken() as string);
  return result.shared ? result.shared.value || result.shared : {};
}

export async function getPreferences(): Promise<SharedPreferences | null> {
  if (!getToken() || !isLoggedIn()) return null;
  try {
    await writes;
    return await query(KEY, fetchPreferences, { ttl: TTL });
  } catch (error) {
    console.error('Failed to get preferences', error);
    return null;
  }
}

async function write(mutate: (shared: SharedPreferences) => SharedPreferences) {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  invalidate(KEY);
  try {
    const next = mutate(await fetchPreferences());
    await lbryRpcAuthenticated('preference_set', {
      key: 'shared',
      value: JSON.stringify({ type: 'object', version: '0.1', value: next }),
    }, token);
    store(KEY, next);
    return true;
  } catch (error) {
    console.error('Failed to save preferences', error);
    return false;
  }
}

export function updatePreferences(mutate: (shared: SharedPreferences) => SharedPreferences) {
  writes = writes.then(() => write(mutate));
  return writes;
}
