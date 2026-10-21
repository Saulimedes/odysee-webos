import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, mockFetch, rpcResult } from '../../tests/helpers';

beforeEach(() => { vi.resetModules(); });

const content = (categories: Record<string, unknown>) => ({ status: 'success', data: { en: { categories } } });

describe('category entity', () => {
  it('parses the homepage content and skips categories without channels', async () => {
    const { parseHomepage } = await import('./category/api/homepage');
    const homepage = parseHomepage(content({
      PRIMARY_CONTENT: { label: 'Featured!', channelIds: ['a'], sortOrder: 2 },
      GAMING: { label: 'Gaming', icon: 'Gaming', channelIds: Array.from({ length: 150 }, (_, index) => String(index)), sortOrder: 60, pageSize: 12, daysOfContent: 30 },
      COMEDY: { name: 'Comedy', channelIds: ['c'], sortOrder: 10 },
      WILD_WEST: { label: 'Wild', sortOrder: 999 },
      EMPTY: { channelIds: [] },
    }) as never);
    expect(homepage.featured?.label).toBe('Featured');
    expect(homepage.categories.map((category) => category.id)).toEqual(['COMEDY', 'GAMING']);
    expect(homepage.categories[1]).toMatchObject({ pageSize: 12, days: 30 });
    expect(homepage.categories[1].channelIds).toHaveLength(100);
    expect(homepage.categories[0]).toMatchObject({ label: 'Comedy', pageSize: 20, days: 90 });
  });

  it('rejects failed responses', async () => {
    const { parseHomepage } = await import('./category/api/homepage');
    expect(() => parseHomepage({ status: 'error' })).toThrow();
  });

  it('refreshes into the shared store, persists, and keeps the old data on failure', async () => {
    const { refreshHomepage, useHomepage } = await import('./category/api/homepage');
    expect(useHomepage).toBeTypeOf('function');
    const spy = mockFetch(() => content({ GAMING: { label: 'Gaming', channelIds: ['a'] } }));
    const first = await refreshHomepage();
    expect(first?.categories).toHaveLength(1);
    await refreshHomepage();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('cache:homepage')).not.toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => new Response('{}', { status: 500 }));
    expect((await refreshHomepage(true))?.categories).toHaveLength(1);
  });

  it('starts from the persisted homepage', async () => {
    const stored = { featured: null, categories: [{ id: 'X', label: 'X', icon: '', channelIds: ['a'], pageSize: 1, days: 1, sortOrder: 1 }] };
    localStorage.setItem('cache:homepage', JSON.stringify({ v: stored, t: Date.now() }));
    const { refreshHomepage } = await import('./category/api/homepage');
    mockFetch(() => content({ GAMING: { channelIds: ['a'] } }));
    expect((await refreshHomepage())?.categories[0].id).toBe('X');
  });

  it('maps category icons by label and by icon name', async () => {
    const { categoryIcon } = await import('./category/lib/icon');
    expect(categoryIcon({ label: 'Gaming', icon: '' })).toBe('Gaming');
    expect(categoryIcon({ label: 'Tech', icon: 'Speaker' })).toBe('Tech');
    expect(categoryIcon({ label: 'Whatever', icon: 'Cheese' })).toBe('Cheese');
    expect(categoryIcon({ label: 'Whatever', icon: 'Music' })).toBe('Music');
    expect(categoryIcon({ label: 'Whatever', icon: 'nope' })).toBeNull();
  });
});

describe('channel entity', () => {
  it('parses channels with thumbnail fallbacks', async () => {
    const { parseChannel } = await import('./channel/model/parse');
    expect(parseChannel({ claim_id: 'c1', name: '@name', value: { title: 'Title', description: 'D', thumbnail: { url: 'https://x/t.png' } } })).toEqual({ id: 'c1', name: 'name', title: 'Title', description: 'D', thumb: 'https://x/t.png' });
    expect(parseChannel({ claim_id: 'c2' })).toEqual({ id: 'c2', name: 'Unknown', title: 'Unknown', description: '', thumb: 'https://thumbnails.lbry.com/c2' });
  });

  it('resolves channel ids with caching', async () => {
    const { resolveChannels } = await import('./channel/api/queries');
    const spy = mockFetch(() => rpcResult({ items: [{ claim_id: 'c1', name: '@a' }] }));
    expect(await resolveChannels([])).toEqual([]);
    expect((await resolveChannels(['c1']))[0].id).toBe('c1');
    await resolveChannels(['c1']);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('session entity', () => {
  const login = async () => {
    const store = await import('./session/model/store');
    store.updateSession({ token: 'tok', user: { primary_email: 'a@b.c' } });
    return store;
  };

  it('restores, updates and clears the session', async () => {
    const store = await import('./session/model/store');
    store.restoreSession();
    expect(store.isLoggedIn()).toBe(false);
    localStorage.setItem('odysee-auth', JSON.stringify({ authToken: 'saved', user: { primary_email: 'x@y.z' } }));
    store.restoreSession();
    expect(store.getToken()).toBe('saved');
    expect(store.isLoggedIn()).toBe(true);
    store.updateUser({ profile_image: 'img' });
    expect(JSON.parse(localStorage.getItem('odysee-auth') as string).user.profile_image).toBe('img');
    store.clearSession();
    expect(store.getToken()).toBeNull();
    expect(localStorage.getItem('odysee-auth')).toBeNull();
    store.updateUser({ profile_image: 'ignored' });
    expect(store.session.get().user).toBeNull();
  });

  it('creates anonymous tokens once', async () => {
    const { ensureToken } = await import('./session/api/auth');
    const spy = mockFetch(() => ({ success: true, data: { auth_token: 'anon' } }));
    expect(await ensureToken()).toBe('anon');
    expect(await ensureToken()).toBe('anon');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('survives token creation failures', async () => {
    const { ensureToken } = await import('./session/api/auth');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => ({ success: false }));
    expect(await ensureToken()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await ensureToken()).toBeNull();
  });

  it('signs in with a password', async () => {
    const { signIn } = await import('./session/api/auth');
    const store = await import('./session/model/store');
    mockFetch((url) => (url.endsWith('/user/new') ? { success: true, data: { auth_token: 't1' } } : { success: true, data: { primary_email: 'a@b.c', auth_token: 't2' } }));
    const result = await signIn('a@b.c', 'pw');
    expect(result).toMatchObject({ success: true });
    expect(store.getToken()).toBe('t2');
    expect(store.isLoggedIn()).toBe(true);
  });

  it('reports sign in failures', async () => {
    const { signIn } = await import('./session/api/auth');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch((url) => (url.endsWith('/user/new') ? { success: true, data: { auth_token: 't1' } } : { success: false, error: 'Bad password' }));
    expect(await signIn('a@b.c', 'pw')).toEqual({ success: false, error: 'Bad password' });
    mockFetch((url) => (url.endsWith('/user/new') ? { success: true, data: { auth_token: 't1' } } : { success: false, error: { message: 'Nested' } }));
    expect(await signIn('a@b.c', 'pw')).toEqual({ success: false, error: 'Nested' });
    mockFetch((url) => (url.endsWith('/user/new') ? { success: true, data: { auth_token: 't1' } } : { success: false }));
    expect(await signIn('a@b.c', 'pw')).toEqual({ success: false, error: 'Login failed' });
    mockFetch((url) => { if (url.endsWith('/user/new')) return { success: true, data: { auth_token: 't1' } }; throw new Error('offline'); });
    expect(await signIn('a@b.c', 'pw')).toMatchObject({ success: false, error: expect.stringContaining('Network') });
  });

  it('fails sign in without a token', async () => {
    const { signIn, requestMagicLink } = await import('./session/api/auth');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => ({ success: false }));
    expect(await signIn('a', 'b')).toMatchObject({ success: false });
    expect(await requestMagicLink('a')).toMatchObject({ success: false });
  });

  it('requests magic links and resends tokens for existing accounts', async () => {
    const { requestMagicLink } = await import('./session/api/auth');
    const store = await import('./session/model/store');
    mockFetch((url) => (url.endsWith('/user/new') ? { success: true, data: { auth_token: 't1' } } : { success: true, data: { auth_token: 't9' } }));
    expect(await requestMagicLink('a@b.c')).toEqual({ success: true });
    expect(store.getToken()).toBe('t9');

    mockFetch((url) => {
      if (url.endsWith('/user/signin')) return new Response('{"success":false}', { status: 409 });
      return { success: true };
    });
    expect(await requestMagicLink('a@b.c')).toEqual({ success: true });

    mockFetch((url) => {
      if (url.endsWith('/user/signin')) return new Response('{"success":false,"error":"Nope"}', { status: 409 });
      return { success: false };
    });
    expect(await requestMagicLink('a@b.c')).toEqual({ success: false, error: 'Nope' });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    expect(await requestMagicLink('a@b.c')).toMatchObject({ success: false });
  });

  it('polls the login status', async () => {
    const { checkLoginStatus } = await import('./session/api/auth');
    const store = await import('./session/model/store');
    expect(await checkLoginStatus()).toBeNull();
    store.updateSession({ token: 'tok' });
    mockFetch(() => ({ success: true, data: { primary_email: 'a@b.c', has_verified_email: false } }));
    expect(await checkLoginStatus()).toBeNull();
    mockFetch(() => ({ success: true, data: { primary_email: 'a@b.c', has_verified_email: true, auth_token: 'x' } }));
    expect(await checkLoginStatus()).toMatchObject({ primary_email: 'a@b.c' });
    expect(store.isLoggedIn()).toBe(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    expect(await checkLoginStatus()).toBeNull();
  });

  it('signs out and clears the session even when the request fails', async () => {
    const { signOut } = await import('./session/api/auth');
    const store = await login();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    await signOut();
    expect(store.getToken()).toBeNull();
    await signOut();
  });

  it('reads and writes preferences safely', async () => {
    const { getPreferences, updatePreferences } = await import('./session/api/preferences');
    expect(await getPreferences()).toBeNull();
    expect(await updatePreferences((shared) => shared)).toBe(false);
    await login();
    const calls: string[] = [];
    mockFetch((_url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      calls.push(`${method}:${params.value ? 'set' : 'get'}`);
      if (method === 'preference_get') return rpcResult({ shared: { value: { following: [], extra: 1 } } });
      return rpcResult({});
    });
    expect(await getPreferences()).toEqual({ following: [], extra: 1 });
    await getPreferences();
    expect(calls).toEqual(['preference_get:get']);
    expect(await updatePreferences((shared) => ({ ...shared, following: [{ uri: 'lbry://x#1' }] }))).toBe(true);
    expect(calls.slice(-2)).toEqual(['preference_get:get', 'preference_set:set']);
    expect((await getPreferences())?.following).toHaveLength(1);
  });

  it('never overwrites preferences when they cannot be read', async () => {
    const { updatePreferences, getPreferences } = await import('./session/api/preferences');
    await login();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = mockFetch(() => ({ error: { message: 'down' } }));
    expect(await updatePreferences((shared) => ({ ...shared, x: 1 }))).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await getPreferences()).toBeNull();
    mockFetch((_url, init) => (JSON.parse(String(init?.body)).method === 'preference_get' ? rpcResult({}) : { error: { message: 'nope' } }));
    expect(await updatePreferences((shared) => ({ ...shared, x: 1 }))).toBe(false);
  });

  it('accepts unwrapped preference payloads', async () => {
    const { getPreferences } = await import('./session/api/preferences');
    await login();
    mockFetch(() => rpcResult({ shared: { following: [] } }));
    expect(await getPreferences()).toEqual({ following: [] });
  });

  it('loads the profile channel from preferences or the first channel', async () => {
    const { loadProfile } = await import('./session/api/profile');
    const store = await import('./session/model/store');
    expect(await loadProfile()).toBeNull();
    await login();
    mockFetch((_url, init) => {
      const { method } = JSON.parse(String(init?.body));
      if (method === 'preference_get') return rpcResult({ shared: { value: { settings: { active_channel_claim: 'c2' } } } });
      return rpcResult({ items: [{ claim_id: 'c1', name: '@one' }, { claim_id: 'c2', name: '@two', value: { thumbnail: { url: 'https://x/t.png' } } }, { claim_id: 'c3' }] });
    });
    expect(await loadProfile()).toMatchObject({ id: 'c2', name: 'two', thumb: 'https://x/t.png' });
    expect(store.session.get().user?.channel?.id).toBe('c2');
    expect(store.session.get().user?.profile_image).toBe('https://x/t.png');
  });

  it('handles accounts without channels and failures', async () => {
    const { loadProfile } = await import('./session/api/profile');
    await login();
    mockFetch((_url, init) => (JSON.parse(String(init?.body)).method === 'claim_list' ? rpcResult({ items: [] }) : rpcResult({})));
    expect(await loadProfile()).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    expect(await loadProfile()).toBeNull();
    await flush();
  });
});
