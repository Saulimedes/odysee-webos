import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, claim, flush, mockFetch, rpcResult } from '../../tests/helpers';
import { setViewport } from '../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { session } from '@/entities/session/model/store';
import { refreshHomepage } from '@/entities/category';
import { collections } from '@/features/collections/model/collections';
import { clearPlaybackHistory } from '@/features/playback-history';
import App from './entrypoint/App';
import { bootSession, handleLogin, handleLogout } from './model/account';
import { retireServiceWorker } from './model/retireServiceWorker';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });

const content = { status: 'success', data: { en: { categories: { GAMING: { label: 'Gaming', channelIds: ['g1'], sortOrder: 1, pageSize: 6 } } } } };

function api() {
  return mockFetch((url, init) => {
    if (url.includes('/content/v2/get')) return content;
    if (url.includes('/user/new')) return { success: true, data: { auth_token: 'anon' } };
    if (url.includes('/user/signout')) return { success: true };
    if (url.includes('/reaction/')) return { success: true, data: { reactions: {}, my_reactions: {} } };
    if (url.includes('/subscription/list')) return { success: true, data: [] };
    if (url.includes('lighthouse')) return [];
    const body = bodyOf(init);
    if (body.method === 'preference_get') return rpcResult({ shared: { value: { builtinCollections: { watchlater: { items: ['lbry://w#w1'] } } } } });
    if (body.method === 'claim_list') return rpcResult({ items: [{ claim_id: 'me1', name: '@me', value: { thumbnail: { url: 'https://x/t.png' } } }] });
    if (body.method === 'claim_search') {
      const params = body.params;
      if (params.claim_ids) return rpcResult({ items: params.claim_ids.map((id: string) => claim(id, `Resolved ${id}`)) });
      return rpcResult({ items: Array.from({ length: params.page_size }, (_, index) => claim(`g-${params.page}-${index}`, `Game ${index}`)) });
    }
    return rpcResult({});
  });
}

beforeEach(() => {
  setViewport();
  invalidate();
  forgetRemembered();
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  clearPlaybackHistory();
  localStorage.clear();
  window.__odyseeReady = vi.fn();
  vi.stubGlobal('close', vi.fn());
});

describe('App', () => {
  it('shows Home first and tells the loader that it is ready', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    expect(window.__odyseeReady).toHaveBeenCalled();
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
  });

  it('opens the sidebar and switches screens', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    press(37);
    expect(document.querySelector('.sidebar--open')).not.toBeNull();
    press(40);
    press(13);
    expect(await screen.findByText('Trending videos on Odysee')).toBeInTheDocument();
    expect(document.querySelector('.sidebar--open')).toBeNull();
  });

  it('plays a video, saves it in history and returns to the same screen', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    press(13);
    expect(document.querySelector('video')).not.toBeNull();
    expect(collections.get().history).toHaveLength(1);
    expect(document.querySelector('.appShell')).toBeNull();
    press(461);
    press(461);
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
  });

  it('removes a played video from Watch Later', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    const first = collections.get();
    expect(first.watchLater).toEqual([]);
  });

  it('handles the back button on every level', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    press(37);
    press(461);
    expect(document.querySelector('.sidebar--open')).toBeNull();
    press(37);
    press(40); press(40); press(40); press(40);
    press(13);
    expect(await screen.findByText('Library', { selector: 'h1' })).toBeInTheDocument();
    press(461);
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
    press(461);
    expect(window.close).toHaveBeenCalled();
    window.webOS = { platformBack: vi.fn() };
    press(461);
    expect(window.webOS.platformBack).toHaveBeenCalled();
    delete window.webOS;
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('returns from list screens to the library', async () => {
    api();
    collections.set({ watchLater: [], favorites: [], history: [{ id: 'h1', title: 'Seen', thumb: null, duration: 60, height: 0, releaseTime: 1, channelName: 'c', channelTitle: 'c', claimName: 'n' }] });
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    press(37);
    for (let index = 0; index < 4; index++) press(40);
    press(13);
    await screen.findByText('Watch History', { selector: '.libraryCard__title' });
    press(13);
    expect(await screen.findByText('Watch History', { selector: 'h1' })).toBeInTheDocument();
    press(461);
    expect(await screen.findByText('Library', { selector: 'h1' })).toBeInTheDocument();
  });

  it('opens the sidebar even while the first screen is still loading', async () => {
    api();
    render(<App />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    press(37);
    expect(document.querySelector('.sidebar--open')).not.toBeNull();
  });

  it('opens the search screen', async () => {
    api();
    render(<App />);
    press(37);
    press(38);
    press(13);
    expect(await screen.findByPlaceholderText('Search Odysee...')).toBeInTheDocument();
  });

  it('signs in from the login screen and signs out from settings', async () => {
    mockFetch((url, init) => {
      if (url.includes('/content/v2/get')) return content;
      if (url.includes('/user/new')) return { success: true, data: { auth_token: 'anon' } };
      if (url.includes('/user/signin')) return { success: true, data: { primary_email: 'me@example.com', auth_token: 'real' } };
      if (url.includes('/user/signout')) return { success: true };
      if (url.includes('/subscription/list')) return { success: true, data: [] };
      const body = bodyOf(init);
      if (body.method === 'preference_get') return rpcResult({ shared: { value: {} } });
      if (body.method === 'claim_list') return rpcResult({ items: [] });
      return rpcResult({ items: Array.from({ length: body.params?.page_size ?? 1 }, (_, index) => claim(`g-${index}`, `Game ${index}`)) });
    });
    await act(async () => { await refreshHomepage(true); });
    render(<App />);
    await screen.findByText('Game 0');
    press(37);
    press(38);
    press(38);
    press(13);
    await screen.findByText('Sign in to Odysee');
    fireEvent.click(screen.getByText('Password'));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByText('Sign In'));
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
    await waitFor(() => expect(session.get().user?.primary_email).toBe('me@example.com'));
    await waitFor(() => expect(screen.getByText('Following')).toBeInTheDocument());

    press(37);
    for (let index = 0; index < 7; index++) press(40);
    press(13);
    await screen.findByText('me@example.com');
    press(13);
    await waitFor(() => expect(session.get().user).toBeNull());
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
  });
});

describe('account flow', () => {
  it('boots a signed out session by fetching the categories', async () => {
    const spy = api();
    bootSession();
    await act(async () => { await flush(); await flush(); });
    expect(spy.mock.calls.some(([url]) => String(url).includes('/content/v2/get'))).toBe(true);
    expect(spy.mock.calls.some(([url]) => String(url).includes('/preference'))).toBe(false);
  });

  it('boots a signed in session by syncing the account and lists', async () => {
    localStorage.setItem('odysee-auth', JSON.stringify({ authToken: 'tok', user: { primary_email: 'a@b.c' } }));
    api();
    bootSession();
    await waitFor(() => expect(session.get().user?.channel?.name).toBe('me'));
    await waitFor(() => expect(collections.get().watchLater.map((entry) => entry.id)).toEqual(['w1']));
  });

  it('refreshes categories and account data after login', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    const spy = api();
    await handleLogin();
    expect(spy.mock.calls.some(([url]) => String(url).includes('/content/v2/get'))).toBe(true);
    expect(collections.get().watchLater).toHaveLength(1);
  });

  it('clears account lists on logout but keeps the viewing history', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    collections.set({ watchLater: [{ id: 'a' } as never], favorites: [{ id: 'b' } as never], history: [{ id: 'c' } as never] });
    api();
    await handleLogout();
    expect(session.get().user).toBeNull();
    expect(collections.get().watchLater).toEqual([]);
    expect(collections.get().history).toHaveLength(1);
  });
});

describe('retireServiceWorker', () => {
  it('unregisters old workers and clears their caches', async () => {
    const unregister = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: async () => [{ unregister }] } });
    vi.stubGlobal('caches', { keys: async () => ['odysee-cache-v1', 'other'], delete: remove });
    retireServiceWorker();
    await flush();
    expect(unregister).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('odysee-cache-v1');
    expect(remove).not.toHaveBeenCalledWith('other');
  });

  it('is safe without browser support or when the calls fail', async () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: async () => { throw new Error('nope'); } } });
    vi.stubGlobal('caches', { keys: async () => { throw new Error('nope'); } });
    expect(() => retireServiceWorker()).not.toThrow();
    await flush();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('caches', undefined);
    expect(() => retireServiceWorker()).not.toThrow();
  });
});

describe('Screens', () => {
  const noop = () => {};
  const loadScreens = async () => (await import('./routing/Screens')).Screens;

  it('falls back to Home for unknown screens and missing channels', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    const Screens = await loadScreens();
    const { unmount } = render(<Screens screen="mystery" channel={null} onLoggedIn={noop} onSignOut={noop} />);
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
    unmount();
    const second = render(<Screens screen="channel" channel={null} onLoggedIn={noop} onSignOut={noop} />);
    expect(await screen.findByText('Game 0')).toBeInTheDocument();
    second.unmount();
  });

  it('shows a channel feed and list screens', async () => {
    api();
    const Screens = await loadScreens();
    const { unmount } = render(<Screens screen="channel" channel={{ id: 'c1', name: 'Chan' }} onLoggedIn={noop} onSignOut={noop} />);
    expect(await screen.findByText('Chan', { selector: 'h1' })).toBeInTheDocument();
    unmount();
    render(<Screens screen="favorites" channel={null} onLoggedIn={noop} onSignOut={noop} />);
    expect(await screen.findByText('No favorite videos')).toBeInTheDocument();
  });

  it('routes the remaining screens', async () => {
    api();
    session.set({ token: 't', user: { primary_email: 'a@b.c' } });
    const Screens = await loadScreens();
    for (const [name, text] of [['categories', 'Categories'], ['following', 'Following'], ['playlists', 'Playlists'], ['featured', 'Content not available']] as const) {
      const view = render(<Screens screen={name} channel={null} onLoggedIn={noop} onSignOut={noop} />);
      await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0));
      view.unmount();
    }
  });
});

describe('Home retry', () => {
  it('offers a retry when Odysee cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const failing = vi.fn(() => { throw new Error('offline'); });
    mockFetch(failing);
    const { default: FreshApp } = await import('./entrypoint/App');
    const { refreshHomepage: freshRefresh } = await import('@/entities/category');
    await act(async () => { await freshRefresh(true); });
    render(<FreshApp />);
    expect(await screen.findByText('Could not reach Odysee')).toBeInTheDocument();
    const calls = failing.mock.calls.length;
    press(13);
    await waitFor(() => expect(failing.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe('index entry', () => {
  it('boots the app', async () => {
    vi.resetModules();
    const render = vi.fn();
    vi.doMock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render })) }));
    document.body.innerHTML = '<div id="app"></div>';
    api();
    await import('../index');
    expect(render).toHaveBeenCalled();
    vi.doUnmock('react-dom/client');
  });
});
