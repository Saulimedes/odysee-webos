import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, jsonResponse, mockFetch, rpcResult } from '../../tests/helpers';

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
    expect(homepage.categories[1].channelIds).toHaveLength(150);
    expect(homepage.categories[0]).toMatchObject({ label: 'Comedy', pageSize: 20, days: 30 });
  });

  it('keeps a category without channels when Odysee names the channels to leave out, like Wild West', async () => {
    const { parseHomepage, parseCategory } = await import('./category/api/homepage');
    const homepage = parseHomepage(content({
      COMEDY: { label: 'Comedy', channelIds: ['c'], sortOrder: 10 },
      WILD_WEST: { label: 'Wild West', icon: 'WildWest', channelLimit: '1', searchLanguages: ['en'], excludedChannelIds: ['x', 'y'], sortOrder: 999, hideByDefault: true },
      OTHER_OPEN: { label: 'Open', excludedChannelIds: ['z'], sortOrder: 500 },
      EXPLORABLE_CHANNEL: { label: 'Discover', sortOrder: 1, channelLimit: '1' },
    }) as never);
    expect(homepage.categories.map((category) => category.id)).toEqual(['COMEDY']);
    expect(homepage.open?.map((category) => category.id)).toEqual(['OTHER_OPEN', 'WILD_WEST']);
    expect(homepage.open?.[1]).toMatchObject({ label: 'Wild West', icon: 'WildWest', channelIds: [], excludedChannelIds: ['x', 'y'], limitPerChannel: 1, languages: ['en'], days: 30, order: 'trending' });
    expect(parseCategory('X', { channelIds: ['a'], excludedChannelIds: ['b'] })?.excludedChannelIds).toBeUndefined();
    expect(parseCategory('X', { excludedChannelIds: [] })).toBeNull();
  });

  it('reads what Odysee asks for a category: one claim per channel, order, shorts and languages', async () => {
    const { parseCategory } = await import('./category/api/homepage');
    const ids = ['a', 'b'];
    expect(parseCategory('GAMING', { channelIds: ids, channelLimit: '2', order: 'new', exclude_shorts: true, searchLanguages: ['en', 'de'], claimType: ['stream', 'repost'] })).toMatchObject({
      limitPerChannel: 2, order: 'new', excludeShorts: true, languages: ['en', 'de'],
    });
    const plain = parseCategory('X', { channelIds: ids });
    expect(plain).toMatchObject({ order: 'trending', excludeShorts: false, days: 30 });
    expect(plain?.limitPerChannel).toBeUndefined();
    expect(plain?.languages).toBeUndefined();
    expect(parseCategory('X', { channelIds: ids, order: 'top' })?.order).toBe('top');
    expect(parseCategory('X', { channelIds: ids, order: 'sideways' })?.order).toBe('trending');
    expect(parseCategory('X', { channelIds: ids, searchLanguages: [] })?.languages).toBeUndefined();
    expect(parseCategory('X', { channelIds: ids, exclude_shorts: false })?.excludeShorts).toBe(false);
  });

  it('reads the channel limit like Odysee does', async () => {
    const { limitPerChannel } = await import('./category/lib/channels');
    expect(limitPerChannel('1', 900)).toBe(1);
    expect(limitPerChannel('3', 900)).toBe(3);
    expect(limitPerChannel(2, 900)).toBe(2);
    expect(limitPerChannel('2.9', 900)).toBe(2);
    expect(limitPerChannel('0', 900)).toBeUndefined();
    expect(limitPerChannel('many', 900)).toBeUndefined();
    expect(limitPerChannel('', 900)).toBeUndefined();
    expect(limitPerChannel(undefined, 900)).toBeUndefined();
    expect(limitPerChannel('auto', 100)).toBe(3);
    expect(limitPerChannel('auto', 200)).toBe(2);
    expect(limitPerChannel('auto', 250)).toBe(1);
    expect(limitPerChannel('auto', 1775)).toBe(1);
  });

  describe('channel sample', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `c${index}`);
    const DAY = 86400000;

    it('keeps short lists as they are and cuts long lists to the sample size', async () => {
      const { sampleChannels, MAX_CHANNELS } = await import('./category/lib/channels');
      const short = ids(MAX_CHANNELS);
      expect(sampleChannels(short)).toBe(short);
      expect(sampleChannels(ids(1775))).toHaveLength(MAX_CHANNELS);
      expect(sampleChannels(ids(MAX_CHANNELS + 1))).toHaveLength(MAX_CHANNELS);
    });

    it('is the same all day for everyone and moves on a full window each day, wrapping around the end', async () => {
      const { sampleChannels } = await import('./category/lib/channels');
      const list = ids(700);
      const today = 20000 * DAY;
      expect(sampleChannels(list, today + 5)).toEqual(sampleChannels(list, today + DAY - 1));
      const first = sampleChannels(list, today, 300);
      const second = sampleChannels(list, today + DAY, 300);
      const third = sampleChannels(list, today + 2 * DAY, 300);
      expect(second[0]).not.toBe(first[0]);
      [first, second, third].forEach((window) => {
        expect(new Set(window).size).toBe(300);
        const at = list.indexOf(window[0]);
        window.forEach((id, index) => expect(id).toBe(list[(at + index) % list.length]));
      });
    });

    it('lets every channel of a long list have its turn within a few days', async () => {
      const { sampleChannels } = await import('./category/lib/channels');
      const list = ids(1775);
      const seen = new Set<string>();
      for (let day = 0; day < 6; day++) sampleChannels(list, (20000 + day) * DAY).forEach((id) => seen.add(id));
      expect(seen.size).toBe(1775);
    });

    it('samples the long lists of the homepage', async () => {
      const { parseHomepage } = await import('./category/api/homepage');
      const homepage = parseHomepage(content({ GAMING: { channelIds: ids(1775), channelLimit: '1' }, SPOOKY: { channelIds: ids(115) } }) as never);
      const gaming = homepage.categories.find((category) => category.id === 'GAMING');
      expect(gaming?.channelIds).toHaveLength(300);
      expect(parseHomepage(content({ A: { channelIds: ids(1775), channelLimit: 'auto' } }) as never).categories[0].limitPerChannel).toBe(1);
      expect(homepage.categories.find((category) => category.id === 'SPOOKY')?.channelIds).toHaveLength(115);
    });

    it('keeps the cached homepage of the biggest languages small enough to be persisted', async () => {
      const { refreshHomepage } = await import('./category/api/homepage');
      const categories = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [
        `CAT${index}`, { label: `Category ${index}`, icon: 'Gaming', channelIds: Array.from({ length: 1200 }, (__, id) => `${String(index).padStart(2, '0')}${String(id).padStart(4, '0')}`.padEnd(40, 'f')), sortOrder: index, channelLimit: '1', exclude_shorts: true, searchLanguages: ['en'] },
      ]));
      mockFetch(() => content(categories));
      await refreshHomepage(true);
      const stored = localStorage.getItem('cache:homepage');
      expect(stored).not.toBeNull();
      expect((stored as string).length).toBeLessThan(250000);
    });
  });

  it('reads the homepage of another language and falls back to English', async () => {
    const { parseHomepage } = await import('./category/api/homepage');
    const response = { status: 'success', data: {
      en: { categories: { GAMING: { label: 'Gaming', channelIds: ['a'], sortOrder: 1 } } },
      de: { categories: { SPIELE: { label: 'Spiele', channelIds: ['b'], sortOrder: 1 } } },
    } };
    expect(parseHomepage(response as never, 'de').categories.map((category) => category.label)).toEqual(['Spiele']);
    expect(parseHomepage(response as never, 'cs').categories.map((category) => category.label)).toEqual(['Gaming']);
    expect(parseHomepage(response as never).categories.map((category) => category.label)).toEqual(['Gaming']);
  });

  it('asks only for the homepage of the chosen language, and for English when Odysee has none for it', async () => {
    const spy = mockFetch(() => ({ status: 'success', data: { en: { categories: { GAMING: { label: 'Gaming', channelIds: ['a'], sortOrder: 1 } } } } }));
    const { refreshHomepage, homepageLanguage } = await import('./category/api/homepage');
    const { setSetting } = await import('@/shared/config');
    setSetting('homepageLanguage', 'de');
    await refreshHomepage(true).catch(() => undefined);
    expect(String(spy.mock.calls[0][0])).toMatch(/content\/v2\/get\?hp=de$/);
    setSetting('homepageLanguage', 'auto');
    setSetting('uiLanguage', 'nl');
    expect(homepageLanguage()).toBe('en');
    await refreshHomepage(true);
    expect(String(spy.mock.calls[1][0])).toMatch(/\?hp=en$/);
    setSetting('uiLanguage', 'cs');
    expect(homepageLanguage()).toBe('en');
    setSetting('uiLanguage', 'auto');
    setSetting('homepageLanguage', 'auto');
  });

  it('picks the homepage language from the setting, or from the app language', async () => {
    const { homepageLanguage } = await import('./category/api/homepage');
    const { setSetting } = await import('@/shared/config');
    setSetting('uiLanguage', 'en');
    expect(homepageLanguage()).toBe('en');
    setSetting('uiLanguage', 'de');
    expect(homepageLanguage()).toBe('de');
    setSetting('uiLanguage', 'pt');
    expect(homepageLanguage()).toBe('pt-BR');
    setSetting('homepageLanguage', 'ru');
    expect(homepageLanguage()).toBe('ru');
    setSetting('homepageLanguage', 'auto');
    setSetting('uiLanguage', 'auto');
  });

  it('switches the homepage language, showing cached rows first, and keeps the English cache key', async () => {
    const response = (label: string, id: string) => ({ status: 'success', data: {
      en: { categories: { GAMING: { label: 'Gaming', channelIds: ['a'], sortOrder: 1 } } },
      de: { categories: { SPIELE: { label: label, channelIds: ['b'], sortOrder: 1 } } },
    }, id });
    const spy = mockFetch(() => response('Spiele', 'x'));
    const { refreshHomepage, switchHomepageLanguage } = await import('./category/api/homepage');
    const { setSetting } = await import('@/shared/config');
    setSetting('uiLanguage', 'en');
    expect((await refreshHomepage(true))?.categories[0].label).toBe('Gaming');
    expect(localStorage.getItem('cache:homepage')).not.toBeNull();
    setSetting('homepageLanguage', 'de');
    const german = await switchHomepageLanguage();
    expect(german?.categories[0].label).toBe('Spiele');
    expect(localStorage.getItem('cache:homepage:de')).not.toBeNull();
    const calls = spy.mock.calls.length;
    setSetting('homepageLanguage', 'en');
    const english = switchHomepageLanguage();
    expect((await english)?.categories[0].label).toBe('Gaming');
    expect(spy.mock.calls.length).toBe(calls);
    setSetting('homepageLanguage', 'auto');
  });

  it('ignores a slow answer for a language that is no longer chosen', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = resolve; })));
    const { refreshHomepage, useHomepageFailed } = await import('./category/api/homepage');
    const { setSetting } = await import('@/shared/config');
    setSetting('homepageLanguage', 'de');
    const pending = refreshHomepage(true);
    setSetting('homepageLanguage', 'en');
    release(new Response(JSON.stringify({ status: 'error' })));
    expect(await pending).toBeNull();
    expect(typeof useHomepageFailed).toBe('function');
    setSetting('homepageLanguage', 'auto');
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

  it('maps category icons by the name Odysee gives them, then by label', async () => {
    const { categoryIcon } = await import('./category/lib/icon');
    expect(categoryIcon({ label: 'Tech', icon: 'Speaker' })).toBe('Speaker');
    expect(categoryIcon({ label: 'Cultura Pop', icon: 'Pop Culture' })).toBe('Pop Culture');
    expect(categoryIcon({ label: 'Whatever', icon: 'PopCulture' })).toBe('Pop Culture');
    expect(categoryIcon({ label: 'Whatever', icon: 'MusicCategory' })).toBe('MusicCategory');
    expect(categoryIcon({ label: 'Gaming', icon: '' })).toBe('Gaming');
    expect(categoryIcon({ label: 'Pop Culture', icon: '' })).toBe('Pop Culture');
    expect(categoryIcon({ label: 'Discover', icon: '' })).toBe('MindBlown');
    expect(categoryIcon({ label: 'Tech', icon: 'nope' })).toBe('Speaker');
    expect(categoryIcon({ label: 'Whatever', icon: 'Cheese' })).toBeNull();
    expect(categoryIcon({ label: 'Whatever', icon: 'nope' })).toBeNull();
    expect(categoryIcon({ label: 'constructor', icon: 'constructor' })).toBeNull();
  });

  it('finds an icon for every category of the Odysee homepage', async () => {
    const { parseHomepage } = await import('./category/api/homepage');
    const { categoryIcon } = await import('./category/lib/icon');
    const odysee: Array<[string, string, string]> = [
      ['PRIMARY_CONTENT', 'Featured', 'Featured'], ['EXPLORABLE_CHANNEL', 'Discover', 'MindBlown'], ['GAMING', 'Gaming', 'Gaming'],
      ['COMEDY', 'Comedy', 'Comedy'], ['POP_CULTURE', 'Pop Culture', 'Pop Culture'], ['EDUCATION', 'Education', 'Education'],
      ['MUSIC', 'Music', 'MusicCategory'], ['SPORTS', 'Sports', 'Sports'], ['TECHNOLOGY', 'Tech', 'Speaker'],
      ['NEWS_AND_POLITICS', 'News & Politics', 'Aperature'], ['FINANCE', 'Finance 2.0', 'DollarSign'], ['ART', 'Artists', 'Artists'],
      ['LIFESTYLE', 'Lifestyle', 'Lifestyle'], ['SPOOKY', 'Spooky', 'Horror'], ['UNIVERSE', 'Universe', 'Universe'],
      ['WILD_WEST', 'Wild West', 'WildWest'], ['SPIRITUALITY', 'Spirituality', 'Spirituality'], ['OUTDOOR', 'Outdoor', 'Life'],
      ['PEACE', 'Peace', 'Peace'],
    ];
    const categories = odysee.reduce<Record<string, unknown>>((all, [id, label, icon], index) => ({ ...all, [id]: { label, icon, channelIds: ['a'], sortOrder: index + 1 } }), {});
    const homepage = parseHomepage(content(categories) as never);
    const parsed = [homepage.featured, ...homepage.categories];
    expect(parsed).toHaveLength(odysee.length);
    parsed.forEach((category) => {
      const wanted = odysee.find(([id]) => id === category?.id) as [string, string, string];
      expect(categoryIcon(category as never)).toBe(wanted[2]);
      expect(categoryIcon({ label: category?.label as string, icon: '' }), `by the label ${wanted[1]}`).not.toBeNull();
    });
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

  it('applies updates that overlap one after another, so none of them is lost', async () => {
    const { updatePreferences, getPreferences } = await import('./session/api/preferences');
    await login();
    let cloud: Record<string, unknown> = {};
    const log: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const { method, params } = JSON.parse(String(init?.body));
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (method === 'preference_get') { log.push('get'); return jsonResponse(rpcResult({ shared: { value: cloud } })); }
      log.push('set');
      cloud = JSON.parse(params.value).value;
      return jsonResponse(rpcResult({}));
    }));
    const first = updatePreferences((shared) => ({ ...shared, a: 1 }));
    const second = updatePreferences((shared) => ({ ...shared, b: 2 }));
    const read = getPreferences();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(cloud).toEqual({ a: 1, b: 2 });
    expect(log).toEqual(['get', 'set', 'get', 'set']);
    expect(await read).toEqual({ a: 1, b: 2 });
  });

  it('keeps writing after one update failed', async () => {
    const { updatePreferences } = await import('./session/api/preferences');
    await login();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => ({ error: { message: 'down' } }));
    expect(await updatePreferences((shared) => shared)).toBe(false);
    mockFetch((_url, init) => rpcResult(JSON.parse(String(init?.body)).method === 'preference_get' ? { shared: { value: {} } } : {}));
    expect(await updatePreferences((shared) => shared)).toBe(true);
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
