import { readJson, writeJson, removeKey } from '@/shared/lib';

interface Entry<T> { v: T; t: number }

const MAX_ENTRIES = 160;
const MAX_PERSIST_BYTES = 250000;
const PERSIST_PREFIX = 'cache:';
const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface CacheOptions { ttl: number; persist?: boolean }

function read<T>(key: string, persist?: boolean): Entry<T> | undefined {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) {
    memory.delete(key);
    memory.set(key, hit);
    return hit;
  }
  if (!persist) return undefined;
  const stored = readJson<Entry<T> | null>(PERSIST_PREFIX + key, null);
  if (stored && typeof stored.t === 'number' && 'v' in stored) {
    memory.set(key, stored);
    return stored;
  }
  return undefined;
}

export function peek<T>(key: string, { ttl, persist }: CacheOptions): { value: T; stale: boolean } | undefined {
  const hit = read<T>(key, persist);
  return hit ? { value: hit.v, stale: Date.now() - hit.t >= ttl } : undefined;
}

export function store<T>(key: string, value: T, persist?: boolean) {
  const entry: Entry<T> = { v: value, t: Date.now() };
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value as string);
  if (persist) {
    const json = JSON.stringify(entry);
    if (json.length <= MAX_PERSIST_BYTES) writeJson(PERSIST_PREFIX + key, entry);
  }
}

export function query<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions): Promise<T> {
  const hit = peek<T>(key, options);
  if (hit && !hit.stale) return Promise.resolve(hit.value);
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const promise = fetcher()
    .then((value) => {
      store(key, value, options.persist);
      return value;
    })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, promise);
  return promise;
}

export function invalidate(prefix = '') {
  Array.from(memory.keys()).filter((key) => key.startsWith(prefix)).forEach((key) => memory.delete(key));
  inflight.forEach((_, key) => { if (key.startsWith(prefix)) inflight.delete(key); });
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const name = localStorage.key(index);
      if (name && name.startsWith(PERSIST_PREFIX + prefix)) removeKey(name);
    }
  } catch { /* storage unavailable */ }
}
