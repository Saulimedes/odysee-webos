import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, mockFetch, rpcResult, video } from '../../tests/helpers';
import { renderWithNav, setViewport, tapOk } from '../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { refreshHomepage } from '@/entities/category';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { savePlaybackPosition, clearPlaybackHistory } from '@/features/playback-history';
import { moveEntry, resetLayout, toggleEntry } from '@/features/customize-layout/model/layout';
import { Home } from './home';
import { FeedPage } from './feed';
import { CategoriesPage } from './categories';
import { setSetting } from '@/shared/config/settings';
import { FollowingPage } from './following';
import { PlaylistsPage } from './playlists';
import type { Video } from '@/entities/video';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };

const content = {
  status: 'success',
  data: { en: { categories: {
    PRIMARY_CONTENT: { label: 'Featured', channelIds: ['f1'], sortOrder: 2, pageSize: 6, daysOfContent: 30 },
    GAMING: { label: 'Gaming', icon: 'Gaming', channelIds: ['g1'], sortOrder: 60, pageSize: 6 },
    TECH: { label: 'Tech', icon: 'Speaker', channelIds: ['t1'], sortOrder: 80, pageSize: 6 },
  } } },
};

interface Options { fail?: boolean; following?: boolean; empty?: boolean; delay?: boolean; homepage?: typeof content }

function api({ fail, empty, homepage = content }: Options = {}) {
  return mockFetch((url, init) => {
    if (url.includes('/content/v2/get')) return homepage;
    if (url.includes('/subscription/list')) return { success: true, data: [{ claim_id: 'c1', channel_name: '@one' }, { claim_id: 'c2', channel_name: '@two' }] };
    if (url.includes('lighthouse')) return [];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method === 'preference_get') {
      return rpcResult({ shared: { value: { builtinCollections: {}, unpublishedCollections: { u1: { name: 'Private list', items: ['lbry://x#p1'], updatedAt: 5 } }, editedCollections: { pub1: { name: 'Edited public', items: ['pub-a'], updatedAt: 9 } } } } });
    }
    if (body.method === 'claim_list') return rpcResult({ items: [{ claim_id: 'pub1', name: 'pl', value: { title: 'Public list', claims: ['pub-a', 'pub-b'] } }, { claim_id: 'c9', name: '@me' }] });
    if (body.method === 'claim_search') {
      if (fail) return { error: { message: 'down' } };
      const params = body.params;
      if (params.claim_type && params.claim_type[0] === 'channel') return rpcResult({ items: [{ claim_id: 'c1', name: '@one', value: { title: 'Channel One' } }] });
      if (empty) return rpcResult({ items: [] });
      if (params.claim_ids) return rpcResult({ items: params.claim_ids.map((id: string) => claim(id, `Resolved ${id}`)) });
      const tag = (params.channel_ids || ['all'])[0];
      return rpcResult({ items: Array.from({ length: params.page_size }, (_, index) => claim(`${tag}-${params.page}-${index}`, `${tag} video ${params.page}-${index}`)) });
    }
    return rpcResult({});
  });
}

const signIn = () => session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });

beforeEach(() => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  setViewport();
  invalidate();
  forgetRemembered();
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  clearPlaybackHistory();
  localStorage.clear();
  resetLayout('home');
});

describe('Home', () => {
  it('shows a spinner until the categories arrive, then loads rows', async () => {
    api();
    renderWithNav(<Home />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { await refreshHomepage(true); });
    expect(await screen.findByText('Featured')).toBeInTheDocument();
    expect(await screen.findByText('f1 video 1-0')).toBeInTheDocument();
    expect(await screen.findByText('Gaming')).toBeInTheDocument();
  });

  it('draws the icon Odysee names in front of each row', async () => {
    api({ homepage: { status: 'success', data: { en: { categories: {
      PRIMARY_CONTENT: { label: 'Featured', icon: 'Featured', channelIds: ['f1'], sortOrder: 1, pageSize: 6 },
      POP_CULTURE: { label: 'Pop Culture', icon: 'Pop Culture', channelIds: ['p1'], sortOrder: 2, pageSize: 6 },
      TECHNOLOGY: { label: 'Tech', icon: 'Speaker', channelIds: ['t1'], sortOrder: 3, pageSize: 6 },
      OTHER: { label: 'Other', icon: 'Unheard Of', channelIds: ['o1'], sortOrder: 4, pageSize: 6 },
    } } } } as never });
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    await waitFor(() => expect(screen.getByText('Pop Culture')).toBeInTheDocument());
    const viewBoxes = () => Array.from(document.querySelectorAll('.videoRow__title')).map((title) => title.querySelector('svg')?.getAttribute('viewBox') ?? null);
    await waitFor(() => expect(document.querySelectorAll('.videoRow__title').length).toBeGreaterThanOrEqual(3));
    expect(viewBoxes().slice(0, 3)).toEqual(['0 0 22 22', '0 0 20 15', '0 0 21 20']);
  });

  it('loads the first rows eagerly and the rest as you scroll', async () => {
    const spy = api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    await waitFor(() => expect(screen.getByText('g1 video 1-0')).toBeInTheDocument());
    const searches = () => spy.mock.calls.filter(([, init]) => init?.body && JSON.parse(String((init as RequestInit).body)).method === 'claim_search').length;
    expect(searches()).toBeGreaterThanOrEqual(3);
  });

  it('adds Following for signed in users and Continue Watching from history', async () => {
    signIn();
    api();
    savePlaybackPosition(video('resume1') as Video, 100, 600);
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    expect(await screen.findByText('Following')).toBeInTheDocument();
    expect(await screen.findByText('Continue Watching')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('.videoRow__title')).slice(0, 2).map((node) => node.textContent)).toEqual(['Following', 'Continue Watching']);
    expect(await screen.findByText('c1 video 1-0')).toBeInTheDocument();
    press(40);
    expect(document.querySelector('.card__progress')).not.toBeNull();
  });

  it('plays the focused card and moves between rows', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    const { nav } = renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    press(39);
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1-1-1' }), expect.any(Array));
    press(40);
    await screen.findByText('g1 video 1-0');
    tapOk();
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'g1-1-0' }), expect.any(Array));
  });

  it('shows cached rows immediately on the next launch', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    const first = renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    await waitFor(() => expect(screen.getByText('g1 video 1-0')).toBeInTheDocument());
    first.unmount();
    mockFetch(() => { throw new Error('offline'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithNav(<Home />);
    expect(screen.getByText('f1 video 1-0')).toBeInTheDocument();
  });

  it('shows an empty state when nothing loads', async () => {
    api({ empty: true });
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument();
  });

  it('survives failing rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api({ fail: true });
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument();
  });

  it('loads more videos at the end of a row', async () => {
    const spy = api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    for (let index = 0; index < 4; index++) press(39);
    await waitFor(() => {
      const pages = spy.mock.calls.map(([, init]) => (init?.body ? JSON.parse(String((init as RequestInit).body)).params?.page : undefined));
      expect(pages).toContain(2);
    });
  });
});

describe('FeedPage', () => {
  it('shows discover videos', async () => {
    api();
    const { nav } = renderWithNav(<FeedPage source={{ kind: 'discover' }} />);
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Trending videos on Odysee')).toBeInTheDocument();
    await screen.findByText('all video 1-0');
    tapOk();
    expect(nav.play).toHaveBeenCalled();
  });

  it('waits for the homepage before showing featured and category feeds', async () => {
    api();
    renderWithNav(<FeedPage source={{ kind: 'featured' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { await refreshHomepage(true); });
    expect(await screen.findByText('f1 video 1-0')).toBeInTheDocument();
  });

  it('shows a category feed', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<FeedPage source={{ kind: 'category', id: 'GAMING' }} />);
    expect(await screen.findByText('g1 video 1-0')).toBeInTheDocument();
    expect(screen.getByText('Gaming')).toBeInTheDocument();
  });

  it('reports unknown categories', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<FeedPage source={{ kind: 'category', id: 'NOPE' }} />);
    expect(screen.getByText('Content not available')).toBeInTheDocument();
  });
});

describe('CategoriesPage', () => {
  it('lists categories and shows the selected one', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<CategoriesPage />);
    expect(screen.getAllByText('Gaming').length).toBeGreaterThan(0);
    expect(screen.getByText('Tech')).toBeInTheDocument();
    expect(await screen.findByText('g1 video 1-0')).toBeInTheDocument();
    press(40);
    expect(await screen.findByText('t1 video 1-0', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('draws the category icons so that they follow the Menu Icon Style, and shrinks the list when the videos have the focus', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<CategoriesPage />);
    const icons = document.querySelectorAll('.masterDetail__list .entry svg');
    expect(icons.length).toBeGreaterThan(1);
    expect(document.querySelectorAll('.masterDetail__list .entry svg.odyIcon').length).toBeGreaterThan(0);
    expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
    press(39);
    expect(document.querySelector('.masterDetail--collapsed')).not.toBeNull();
    expect((document.querySelector('.masterDetail__list') as HTMLElement).style.width).toBe('92px');
    press(461);
    expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
  });

  it('lists Wild West, which has no channels of its own, last and fills it with everything but the left out channels', async () => {
    const withWildWest = { ...content, data: { en: { categories: {
      ...content.data.en.categories,
      WILD_WEST: { label: 'Wild West', icon: 'WildWest', sortOrder: 999, channelLimit: '1', searchLanguages: ['en'], excludedChannelIds: ['x1', 'x2'], pageSize: 6 },
    } } } };
    const spy = api({ homepage: withWildWest as never });
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<CategoriesPage />);
    await screen.findByText('Tech');
    const labels = () => Array.from(document.querySelectorAll('.entry__label')).map((node) => node.textContent);
    expect(labels()).toEqual(['Gaming', 'Tech', 'Wild West']);
    toggleEntry('home', 'GAMING');
    setSetting('categoriesFollowHome', true);
    await waitFor(() => expect(labels()).toEqual(['Tech', 'Wild West']));
    press(40);
    expect(await screen.findByText('all video 1-0', {}, { timeout: 2000 })).toBeInTheDocument();
    const asked = spy.mock.calls
      .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : {}))
      .filter((body) => body.method === 'claim_search' && body.params.not_channel_ids);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0].params).toMatchObject({ not_channel_ids: ['x1', 'x2'], limit_claims_per_channel: 1, any_languages: ['en'] });
    expect(asked[0].params).not.toHaveProperty('channel_ids');
    setSetting('categoriesFollowHome', false);
  });

  it('shows a spinner while the homepage is missing', async () => {
    api();
    vi.resetModules();
    const fresh = await import('./categories');
    renderWithNav(<fresh.CategoriesPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('FollowingPage', () => {
  it('asks guests to log in', () => {
    api();
    renderWithNav(<FollowingPage />);
    expect(screen.getByText('Please log in to see channels you follow')).toBeInTheDocument();
  });

  it('lists followed channels sorted by activity with avatars resolved', async () => {
    signIn();
    api();
    renderWithNav(<FollowingPage />);
    expect(await screen.findByText('Channel One')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(await screen.findByText('c1 video 1-0')).toBeInTheDocument();
    press(40);
    expect(await screen.findByText('Channel One', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('handles accounts that follow nobody', async () => {
    signIn();
    mockFetch((url) => {
      if (url.includes('/subscription/list')) return { success: true, data: [] };
      return rpcResult({ items: [] });
    });
    renderWithNav(<FollowingPage />);
    expect(await screen.findByText('No recent videos')).toBeInTheDocument();
  });
});

describe('PlaylistsPage', () => {
  it('asks guests to log in', () => {
    api();
    renderWithNav(<PlaylistsPage />);
    expect(screen.getByText('Login to see your playlists')).toBeInTheDocument();
  });

  it('shows the local lists first and then account playlists', async () => {
    signIn();
    api();
    collections.set({ watchLater: [video('wl1') as Video], favorites: [], history: [] });
    renderWithNav(<PlaylistsPage />);
    expect(screen.getAllByText('Watch Later').length).toBeGreaterThan(0);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(await screen.findByText('Video wl1')).toBeInTheDocument();
    expect(await screen.findByText('Private list')).toBeInTheDocument();
    expect(screen.getByText('Edited public')).toBeInTheDocument();
    press(40); press(40);
    await waitFor(() => expect(screen.getByText('Resolved pub-a')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('opens a remote playlist after selecting it', async () => {
    signIn();
    api();
    renderWithNav(<PlaylistsPage />);
    await screen.findByText('Edited public');
    fireEvent.click(screen.getByText('Edited public'));
    expect(await screen.findByText('Resolved pub-a', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('survives failing playlist requests', async () => {
    signIn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    renderWithNav(<PlaylistsPage />);
    expect((await screen.findAllByText('Watch Later')).length).toBeGreaterThan(0);
    await act(async () => { await flush(); });
  });
});

describe('Home customization', () => {
  const titles = () => Array.from(document.querySelectorAll('.videoRow__title')).map((node) => node.textContent);

  it('hides rows and does not load them', async () => {
    const spy = api();
    toggleEntry('home', 'GAMING');
    renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    await screen.findByText('Featured');
    await screen.findByText('Tech');
    expect(titles()).toEqual(['Featured', 'Tech']);
    expect(spy.mock.calls.some(([, init]) => String((init as RequestInit | undefined)?.body).includes('g1'))).toBe(false);
  });

  it('adds Wild West, which has no channels of its own, as the last row only once it is shown', async () => {
    const withWildWest = { ...content, data: { en: { categories: {
      ...content.data.en.categories,
      WILD_WEST: { label: 'Wild West', icon: 'WildWest', sortOrder: 999, channelLimit: '1', excludedChannelIds: ['x1', 'x2'], pageSize: 6 },
    } } } };
    const spy = api({ homepage: withWildWest as never });
    const view = renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    await screen.findByText('Tech');
    expect(titles()).toEqual(['Featured', 'Gaming', 'Tech']);
    const asked = () => spy.mock.calls
      .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : {}))
      .filter((body) => body.method === 'claim_search' && body.params.not_channel_ids);
    expect(asked()).toHaveLength(0);
    view.unmount();
    toggleEntry('home', 'WILD_WEST', true);
    renderWithNav(<Home />);
    await screen.findByText('Featured');
    press(40); press(40); press(40);
    await screen.findByText('Wild West');
    expect(titles().map((title) => title?.trim())).toEqual(['Tech', 'Wild West']);
    expect(await screen.findByText('all video 1-0', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(asked()[0].params).toMatchObject({ not_channel_ids: ['x1', 'x2'], limit_claims_per_channel: 1 });
    expect(asked()[0].params).not.toHaveProperty('channel_ids');
  });

  it('shows rows in the order the user picked', async () => {
    api();
    moveEntry('home', ['continue', 'following', 'PRIMARY_CONTENT', 'GAMING', 'TECH'], 'TECH', -1);
    renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    await screen.findByText('Gaming');
    expect(titles().slice(0, 3)).toEqual(['Featured', 'Tech', 'Gaming']);
  });

  it('can move or hide Continue Watching and Following', async () => {
    api();
    signIn();
    savePlaybackPosition(video('seen') as Video, 100, 600);
    moveEntry('home', ['continue', 'following', 'PRIMARY_CONTENT'], 'continue', 1);
    renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    await screen.findByText('Following');
    expect(titles().slice(0, 2)).toEqual(['Following', 'Continue Watching']);
  });

  it('explains when every row is hidden', async () => {
    api();
    ['PRIMARY_CONTENT', 'GAMING', 'TECH', 'continue'].forEach((id) => toggleEntry('home', id));
    renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    expect(await screen.findByText('All home rows are hidden')).toBeInTheDocument();
    expect(screen.getByText(/Customize Homepage/)).toBeInTheDocument();
  });

  it('tells the start screen that Home is ready once it has rows', async () => {
    window.__odyseeReady = vi.fn();
    api();
    renderWithNav(<Home />);
    expect(window.__odyseeReady).not.toHaveBeenCalled();
    await act(async () => { await refreshHomepage(true); });
    await waitFor(() => expect(window.__odyseeReady).toHaveBeenCalled());
  });

  it('does not blame the layout when the homepage itself is empty', async () => {
    mockFetch(() => ({ status: 'success', data: { en: { categories: {} } } }));
    renderWithNav(<Home />);
    await act(async () => { await refreshHomepage(true); });
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument();
  });

  it('also tells it when nothing could be loaded', async () => {
    window.__odyseeReady = vi.fn();
    api({ empty: true });
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('Nothing to show yet');
    expect(window.__odyseeReady).toHaveBeenCalled();
  });
});

describe('Home like on Odysee', () => {
  it('puts Following on top for signed in users and Continue Watching right below', async () => {
    api();
    signIn();
    savePlaybackPosition(video('seen') as Video, 100, 600);
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('Following');
    await screen.findByText('Featured');
    expect(Array.from(document.querySelectorAll('.videoRow__title')).slice(0, 3).map((node) => node.textContent)).toEqual(['Following', 'Continue Watching', 'Featured']);
  });

  it('starts with Continue Watching for guests', async () => {
    api();
    savePlaybackPosition(video('seen') as Video, 100, 600);
    await act(async () => { await refreshHomepage(true); });
    renderWithNav(<Home />);
    await screen.findByText('Featured');
    expect(Array.from(document.querySelectorAll('.videoRow__title')).slice(0, 2).map((node) => node.textContent)).toEqual(['Continue Watching', 'Featured']);
  });
});

describe('CategoriesPage and the home layout', () => {
  const entryLabels = () => Array.from(document.querySelectorAll('.entry__label')).map((node) => node.textContent);

  it('keeps its own order by default', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    toggleEntry('home', 'GAMING');
    renderWithNav(<CategoriesPage />);
    await screen.findByText('Tech');
    expect(entryLabels()).toEqual(['Gaming', 'Tech']);
  });

  it('follows the order and the hidden rows of the homepage when asked to', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    toggleEntry('home', 'GAMING');
    setSetting('categoriesFollowHome', true);
    renderWithNav(<CategoriesPage />);
    await waitFor(() => expect(entryLabels()).toEqual(['Tech']));
    setSetting('categoriesFollowHome', false);
  });
});
