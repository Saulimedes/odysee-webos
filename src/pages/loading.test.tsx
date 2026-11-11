import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, mockFetch, rpcResult } from '../../tests/helpers';
import { renderWithNav, setViewport } from '../../tests/render';
import { PRIORITY_BACKGROUND, PRIORITY_FOREGROUND, invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { refreshHomepage, useHomepage } from '@/entities/category';
import { buildParams } from '@/entities/video/api/queries';
import { categoryFeed } from '@/features/browse-feeds';
import { clearPlaybackHistory } from '@/features/playback-history';
import { resetLayout } from '@/features/customize-layout/model/layout';
import { session } from '@/entities/session/model/store';
import { Home } from './home';
import { CategoriesPage } from './categories';

const calls = vi.hoisted(() => [] as Array<{ method: string; params: Record<string, any>; priority?: number }>);
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, lbryRpc: (method: string, params: object, priority?: number) => { calls.push({ method, params, priority }); return actual.lbryRpc(method, params, priority); } };
});

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };

const content = {
  status: 'success',
  data: { en: { categories: {
    PRIMARY_CONTENT: { label: 'Featured', channelIds: ['f1'], sortOrder: 2, pageSize: 6, daysOfContent: 30 },
    A: { label: 'Alpha', channelIds: ['a1'], sortOrder: 10, pageSize: 6, daysOfContent: 180, channelLimit: '1', exclude_shorts: true, searchLanguages: ['en'], order: 'trending' },
    B: { label: 'Bravo', channelIds: ['b1'], sortOrder: 20, pageSize: 6 },
    C: { label: 'Charlie', channelIds: ['c1'], sortOrder: 30, pageSize: 6 },
    D: { label: 'Delta', channelIds: ['d1'], sortOrder: 40, pageSize: 6 },
  } } },
};

function api() {
  return mockFetch((url, init) => {
    if (url.includes('/content/v2/get')) return content;
    if (url.includes('lighthouse')) return [];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method === 'claim_search') {
      const params = body.params;
      const tag = (params.channel_ids || ['all'])[0];
      return rpcResult({ items: Array.from({ length: params.page_size }, (_, index) => claim(`${tag}-${params.page}-${index}`, `${tag} video ${params.page}-${index}`)) });
    }
    return rpcResult({});
  });
}

const searches = (channel?: string) => calls
  .filter((call) => call.method === 'claim_search' && (!channel || call.params.channel_ids?.[0] === channel))
  .map((call) => ({ channel: call.params.channel_ids?.[0], page: call.params.page, size: call.params.page_size, priority: call.priority ?? PRIORITY_FOREGROUND }));

beforeEach(() => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  setViewport();
  invalidate();
  forgetRemembered();
  session.set({ token: null, user: null });
  clearPlaybackHistory();
  localStorage.clear();
  resetLayout('home');
  calls.length = 0;
});

afterEach(() => { vi.useRealTimers(); });

const homepage = async () => {
  api();
  await act(async () => { await refreshHomepage(true); });
};

describe('Home rows', () => {
  it('start the first two rows in the foreground and the rows after them in the background', async () => {
    await homepage();
    renderWithNav(<Home />);
    await waitFor(() => expect(searches()).toHaveLength(4));
    await flush();
    expect(searches().map((call) => [call.channel, call.priority])).toEqual([
      ['f1', PRIORITY_FOREGROUND], ['a1', PRIORITY_FOREGROUND], ['b1', PRIORITY_BACKGROUND], ['c1', PRIORITY_BACKGROUND],
    ]);
    expect(searches('d1')).toEqual([]);
  });

  it('ask for a category like Odysee: one claim per channel, no shorts, the languages and the period of the category', async () => {
    await homepage();
    renderWithNav(<Home />);
    await screen.findByText('a1 video 1-0');
    const call = calls.find((entry) => entry.params.channel_ids?.[0] === 'a1');
    expect(call?.params).toMatchObject({
      channel_ids: ['a1'], limit_claims_per_channel: 1, exclude_shorts: true, any_languages: ['en'], has_source: true,
      order_by: ['trending_group', 'trending_mixed'], page_size: 6, page: 1, claim_type: ['stream'], no_totals: true,
    });
    expect(call?.params.release_time).toMatch(/^>\d+$/);
    const plain = calls.find((entry) => entry.params.channel_ids?.[0] === 'b1');
    expect(plain?.params).not.toHaveProperty('limit_claims_per_channel');
    expect(plain?.params).not.toHaveProperty('exclude_shorts');
    expect(plain?.params).not.toHaveProperty('any_languages');
  });

  it('refresh rows that went stale in the background, without blanking them', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await homepage();
    const first = renderWithNav(<Home />);
    await screen.findByText('a1 video 1-0');
    await waitFor(() => expect(searches()).toHaveLength(4));
    await flush();
    first.unmount();
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    calls.length = 0;
    renderWithNav(<Home />);
    expect(screen.getByText('f1 video 1-0')).toBeInTheDocument();
    expect(screen.getByText('a1 video 1-0')).toBeInTheDocument();
    await waitFor(() => expect(searches()).toHaveLength(4));
    searches().forEach((call) => expect(call.priority).toBe(PRIORITY_BACKGROUND));
    expect(screen.getByText('f1 video 1-0')).toBeInTheDocument();
    await flush();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Categories page and the Home rows', () => {
  const alpha = async () => {
    const holder: { current: ReturnType<typeof useHomepage> } = { current: null };
    function Probe() { holder.current = useHomepage(); return null; }
    renderWithNav(<Probe />);
    return holder.current?.categories.find((category) => category.id === 'A');
  };

  it('asks for the first page of a category with exactly the query of its Home row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await homepage();
    renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    const category = await alpha();
    expect(category).toBeDefined();
    const sent = calls.find((call) => call.params.channel_ids?.[0] === 'a1');
    expect(sent?.params).toEqual(buildParams(categoryFeed(category as NonNullable<typeof category>, 1)));
    expect(sent?.params.page_size).toBe(6);
  });

  it('shows the category at once when its Home row has loaded, without asking again', async () => {
    await homepage();
    const home = renderWithNav(<Home />);
    await screen.findByText('b1 video 1-0');
    home.unmount();
    calls.length = 0;
    renderWithNav(<CategoriesPage />);
    expect(screen.getByText('a1 video 1-0')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    await flush();
    expect(searches('a1')).toEqual([]);
    expect(searches('b1')).toEqual([]);
  });

  it('loads the selected category in the foreground and only the next one in the background', async () => {
    await homepage();
    renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    await waitFor(() => expect(searches('b1')).toHaveLength(1));
    expect(searches('a1')).toEqual([{ channel: 'a1', page: 1, size: 6, priority: PRIORITY_FOREGROUND }]);
    expect(searches('b1')).toEqual([{ channel: 'b1', page: 1, size: 6, priority: PRIORITY_BACKGROUND }]);
    expect(searches().map((call) => call.channel).sort()).toEqual(['a1', 'b1']);
  });

  it('prefetches the neighbours of the selection once it has rested, and never fetches the same page twice', async () => {
    await homepage();
    renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    await waitFor(() => expect(searches('b1')).toHaveLength(1));
    calls.length = 0;
    press(40);
    expect(await screen.findByText('b1 video 1-0', {}, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(searches('c1')).toHaveLength(1));
    expect(searches()).toEqual([{ channel: 'c1', page: 1, size: 6, priority: PRIORITY_BACKGROUND }]);
    press(40);
    expect(await screen.findByText('c1 video 1-0', {}, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(searches('d1')).toHaveLength(1));
    expect(searches().map((call) => [call.channel, call.page, call.priority])).toEqual([
      ['c1', 1, PRIORITY_BACKGROUND], ['d1', 1, PRIORITY_BACKGROUND],
    ]);
  });

  it('prefetches the category before the selected one as well', async () => {
    await homepage();
    const first = renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    press(40); press(40);
    await screen.findByText('c1 video 1-0', {}, { timeout: 2000 });
    first.unmount();
    invalidate();
    calls.length = 0;
    renderWithNav(<CategoriesPage />);
    await screen.findByText('c1 video 1-0');
    await waitFor(() => expect(searches()).toHaveLength(3));
    expect(searches().map((call) => [call.channel, call.priority]).sort()).toEqual([
      ['b1', PRIORITY_BACKGROUND], ['c1', PRIORITY_FOREGROUND], ['d1', PRIORITY_BACKGROUND],
    ]);
  });

  it('survives a neighbour that fails to load, and loads it when it is opened', async () => {
    await homepage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let offline = true;
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.method !== 'claim_search') return rpcResult({});
      if (offline && body.params.channel_ids[0] === 'b1') throw new Error('offline');
      return rpcResult({ items: Array.from({ length: body.params.page_size }, (_, index) => claim(`${body.params.channel_ids[0]}-1-${index}`, `${body.params.channel_ids[0]} video 1-${index}`)) });
    });
    renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    await waitFor(() => expect(searches('b1')).toHaveLength(1));
    await flush();
    offline = false;
    press(40);
    expect(await screen.findByText('b1 video 1-0', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('asks for the next page when the selection is within two rows of the end, before any key is pressed at the end', async () => {
    await homepage();
    renderWithNav(<CategoriesPage />);
    await screen.findByText('a1 video 1-0');
    await flush();
    expect(searches('a1').map((call) => call.page)).toEqual([1]);
    press(39);
    await waitFor(() => expect(searches('a1').map((call) => call.page)).toContain(2));
    searches('a1').forEach((call) => expect(call.size).toBe(6));
    await flush();
    expect(Math.max(...searches('a1').map((call) => call.page))).toBeLessThan(6);
  });
});
