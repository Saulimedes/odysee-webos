import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, mockFetch, rpcResult, video } from '../../tests/helpers';
import { renderWithNav, setViewport } from '../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { refreshHomepage } from '@/entities/category';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { savePlaybackPosition, clearPlaybackHistory } from '@/features/playback-history';
import { Home } from './home';
import { FeedPage } from './feed';
import { CategoriesPage } from './categories';
import { FollowingPage } from './following';
import { PlaylistsPage } from './playlists';
import type { Video } from '@/entities/video';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });

const content = {
  status: 'success',
  data: { en: { categories: {
    PRIMARY_CONTENT: { label: 'Featured', channelIds: ['f1'], sortOrder: 2, pageSize: 6, daysOfContent: 30 },
    GAMING: { label: 'Gaming', icon: 'Gaming', channelIds: ['g1'], sortOrder: 60, pageSize: 6 },
    TECH: { label: 'Tech', icon: 'Speaker', channelIds: ['t1'], sortOrder: 80, pageSize: 6 },
  } } },
};

interface Options { fail?: boolean; following?: boolean; empty?: boolean; delay?: boolean }

function api({ fail, empty }: Options = {}) {
  return mockFetch((url, init) => {
    if (url.includes('/content/v2/get')) return content;
    if (url.includes('/subscription/list')) return { success: true, data: [{ claim_id: 'c1', channel_name: '@one' }, { claim_id: 'c2', channel_name: '@two' }] };
    if (url.includes('lighthouse')) return [];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method === 'preference_get') {
      return rpcResult({ shared: { value: { builtinCollections: {}, unpublishedCollections: { u1: { name: 'Private list', items: ['lbry://x#p1'], updatedAt: 5 } }, editedCollections: { pub1: { name: 'Edited public', items: ['pub-a'], updatedAt: 9 } } } } });
    }
    if (body.method === 'claim_list') return rpcResult({ items: [{ claim_id: 'pub1', name: 'pl', value: { title: 'Public list', claims: ['pub-a', 'pub-b'] } }, { claim_id: 'c9', name: '@me' }] });
    if (body.method === 'claim_search') {
      if (fail) throw new Error('offline');
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
  setViewport();
  invalidate();
  forgetRemembered();
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  clearPlaybackHistory();
  localStorage.clear();
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
    expect(await screen.findByText('Continue Watching')).toBeInTheDocument();
    expect(document.querySelector('.card__progress')).not.toBeNull();
    press(40);
    expect(await screen.findByText('Following')).toBeInTheDocument();
    expect(await screen.findByText('c1 video 1-0')).toBeInTheDocument();
  });

  it('plays the focused card and moves between rows', async () => {
    api();
    await act(async () => { await refreshHomepage(true); });
    const { nav } = renderWithNav(<Home />);
    await screen.findByText('f1 video 1-0');
    press(39);
    press(13);
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1-1-1' }));
    press(40);
    await screen.findByText('g1 video 1-0');
    press(13);
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'g1-1-0' }));
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
    press(13);
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

  it('shows the videos of a channel', async () => {
    api();
    renderWithNav(<FeedPage source={{ kind: 'channel', id: 'abc', name: 'My channel' }} />);
    expect(screen.getByText('My channel')).toBeInTheDocument();
    expect(await screen.findByText('abc video 1-0')).toBeInTheDocument();
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
