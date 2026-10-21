import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, mockFetch, rpcResult, video } from '../../tests/helpers';
import type { Video } from '@/entities/video';

beforeEach(() => { vi.resetModules(); vi.useRealTimers(); });

const v = (id: string, extra: Record<string, unknown> = {}) => video(id, extra) as Video;

async function loginAs() {
  const session = await import('@/entities/session/model/store');
  session.updateSession({ token: 'tok', user: { primary_email: 'a@b.c' } });
}

describe('playback history (continue watching)', () => {
  it('ignores the first seconds of a video and saves real progress', async () => {
    const history = await import('./playback-history');
    expect(history.savePlaybackPosition(v('a'), 5, 600)).toBe(false);
    expect(history.savePlaybackPosition(v('a'), 120, 600)).toBe(true);
    expect(history.getSavedPosition('a')).toBe(120);
    expect(history.savePlaybackPosition(v('a'), 5, 600)).toBe(true);
    expect(history.getSavedPosition('a')).toBe(5);
    expect(history.getSavedPosition('missing')).toBe(0);
  });

  it('removes finished videos', async () => {
    const history = await import('./playback-history');
    history.savePlaybackPosition(v('a'), 120, 600);
    expect(history.savePlaybackPosition(v('a'), 580, 600)).toBe(true);
    expect(history.getSavedPosition('a')).toBe(0);
    expect(history.removePlaybackItem('a')).toBe(false);
    expect(history.savePlaybackPosition(v('b'), 590, 600)).toBe(false);
  });

  it('rejects invalid numbers', async () => {
    const history = await import('./playback-history');
    expect(history.savePlaybackPosition(v('a'), Number.NaN, 600)).toBe(false);
    expect(history.savePlaybackPosition(v('a'), 100, 0)).toBe(false);
  });

  it('keeps the most recent items first and caps the list at 20', async () => {
    vi.useFakeTimers();
    const history = await import('./playback-history/model/playbackHistory');
    for (let index = 0; index < 25; index++) {
      vi.setSystemTime(1_000_000 + index * 1000);
      history.savePlaybackPosition(v(`v${index}`), 100, 600);
    }
    const stored = JSON.parse(localStorage.getItem('continue_watching') as string);
    expect(stored.items).toHaveLength(20);
    expect(stored.items[0].video.id).toBe('v24');
    expect(history.readPlaybackHistory()[0].video.id).toBe('v24');
    expect(history.progressPercent(history.readPlaybackHistory()[0])).toBeCloseTo(16.67, 1);
  });

  it('reads only valid stored items and clears', async () => {
    localStorage.setItem('continue_watching', JSON.stringify({ version: 1, items: [
      { video: video('ok'), positionSeconds: 50, durationSeconds: 100, updatedAt: 2 },
      { video: video('done'), positionSeconds: 99, durationSeconds: 100, updatedAt: 3 },
      { video: { nope: true }, positionSeconds: 5, durationSeconds: 100 },
      { video: video('bad'), positionSeconds: 'x', durationSeconds: 100 },
      { video: video('no-time'), positionSeconds: 10, durationSeconds: 100 },
    ] }));
    const history = await import('./playback-history/model/playbackHistory');
    expect(history.readPlaybackHistory().map((item) => item.video.id)).toEqual(['ok', 'no-time']);
    history.clearPlaybackHistory();
    expect(history.readPlaybackHistory()).toEqual([]);
  });

  it('ignores unknown storage versions and shapes', async () => {
    localStorage.setItem('continue_watching', JSON.stringify({ version: 2, items: [] }));
    const history = await import('./playback-history/model/playbackHistory');
    expect(history.readPlaybackHistory()).toEqual([]);
    localStorage.setItem('continue_watching', JSON.stringify({ version: 1, items: 'x' }));
    expect(history.readPlaybackHistory()).toEqual([]);
  });

  it('updates subscribers', async () => {
    const history = await import('./playback-history');
    function View() { return <span>{history.usePlaybackHistory().length}</span>; }
    render(<View />);
    expect(screen.getByText('0')).toBeInTheDocument();
    act(() => { history.savePlaybackPosition(v('a'), 100, 600); });
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('collections', () => {
  it('adds, toggles and removes local items without an account', async () => {
    const lists = await import('./collections');
    lists.toggleInCollection('watchLater', v('a'));
    lists.toggleInCollection('watchLater', v('a'));
    const { collections } = await import('./collections/model/collections');
    expect(collections.get().watchLater).toEqual([]);
    lists.toggleInCollection('favorites', v('b'));
    lists.toggleInCollection('favorites', v('b'));
    lists.toggleInCollection('favorites', v('c'));
    expect(collections.get().favorites.map((entry) => entry.id)).toEqual(['c']);
    lists.removeFromCollection('favorites', 'unknown');
    lists.removeFromCollection('favorites', 'c');
    expect(collections.get().favorites).toEqual([]);
  });

  it('writes lists to storage after a short delay and flushes on demand', async () => {
    vi.useFakeTimers();
    const lists = await import('./collections');
    lists.toggleInCollection('favorites', v('a'));
    expect(localStorage.getItem('odysee-favorites')).toBeNull();
    vi.advanceTimersByTime(600);
    expect(JSON.parse(localStorage.getItem('odysee-favorites') as string)).toHaveLength(1);
    lists.toggleInCollection('favorites', v('b'));
    lists.flushCollections();
    expect(JSON.parse(localStorage.getItem('odysee-favorites') as string)).toHaveLength(2);
  });

  it('loads migrated lists from storage and keeps history capped and unique', async () => {
    localStorage.setItem('odysee-watch-history', JSON.stringify([{ id: 'old', title: 'Old', thumbnail: 't', _claimName: 'old-name' }]));
    const lists = await import('./collections');
    const { collections } = await import('./collections/model/collections');
    expect(collections.get().history[0]).toMatchObject({ id: 'old', thumb: 't', claimName: 'old-name' });
    for (let index = 0; index < 210; index++) lists.addToHistory(v(`h${index}`));
    lists.addToHistory(v('h5'));
    expect(collections.get().history).toHaveLength(200);
    expect(collections.get().history[0].id).toBe('h5');
    expect(collections.get().history.filter((entry) => entry.id === 'h5')).toHaveLength(1);
  });

  it('pushes changes to the cloud when logged in', async () => {
    await loginAs();
    const lists = await import('./collections');
    const sets: { value: string }[] = [];
    mockFetch((_url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      if (method === 'preference_get') return rpcResult({ shared: { value: { builtinCollections: { watchlater: { items: ['lbry://old#id0'] } }, keep: true } } });
      sets.push(params);
      return rpcResult({});
    });
    lists.toggleInCollection('watchLater', v('id1'));
    await flush(); await flush(); await flush();
    const saved = JSON.parse(sets[0].value).value;
    expect(saved.keep).toBe(true);
    expect(saved.builtinCollections.watchlater.items).toEqual(['lbry://name-id1#id1', 'lbry://old#id0']);
    expect(saved.builtinCollections.watchlater.itemCount).toBe(2);

    lists.toggleInCollection('watchLater', v('id1'));
    await flush(); await flush(); await flush();
    expect(JSON.parse(sets[1].value).value.builtinCollections.watchlater.items).toEqual(['lbry://old#id0']);
  });

  it('does not duplicate items that are already in the cloud list', async () => {
    await loginAs();
    const lists = await import('./collections');
    const sets: { value: string }[] = [];
    mockFetch((_url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      if (method === 'preference_get') return rpcResult({ shared: { value: { builtinCollections: { favorites: { items: ['lbry://name-id1#id1'] } } } } });
      sets.push(params);
      return rpcResult({});
    });
    lists.toggleInCollection('favorites', v('id1'));
    await flush(); await flush(); await flush();
    expect(JSON.parse(sets[0].value).value.builtinCollections.favorites.items).toEqual(['lbry://name-id1#id1']);
  });

  it('syncs both lists from the cloud with one lookup', async () => {
    await loginAs();
    const lists = await import('./collections');
    const { collections } = await import('./collections/model/collections');
    const spy = mockFetch((_url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      if (method === 'preference_get') {
        return rpcResult({ shared: { value: { builtinCollections: { watchlater: { items: ['lbry://a#w1', 'lbry://b#w2', 'lbry://bad'] }, favorites: { items: ['lbry://c#w2'] } } } } });
      }
      expect(params.claim_ids.sort()).toEqual(['w1', 'w2']);
      return rpcResult({ items: [claim('w2'), claim('w1')] });
    });
    await lists.syncCollections();
    expect(collections.get().watchLater.map((entry) => entry.id)).toEqual(['w1', 'w2']);
    expect(collections.get().favorites.map((entry) => entry.id)).toEqual(['w2']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps local lists when the cloud has none or lookups fail', async () => {
    await loginAs();
    const lists = await import('./collections');
    const { collections } = await import('./collections/model/collections');
    lists.toggleInCollection('favorites', v('keep'));
    mockFetch(() => rpcResult({ shared: { value: {} } }));
    await lists.syncCollections();
    expect(collections.get().favorites).toHaveLength(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch((_url, init) => (JSON.parse(String(init?.body)).method === 'preference_get'
      ? rpcResult({ shared: { value: { builtinCollections: { favorites: { items: ['lbry://x#x1'] } } } } })
      : { error: { message: 'down' } }));
    await lists.syncCollections(['favorites']);
    expect(collections.get().favorites).toHaveLength(1);
  });

  it('clears chosen lists', async () => {
    const lists = await import('./collections');
    const { collections } = await import('./collections/model/collections');
    lists.toggleInCollection('favorites', v('a'));
    lists.addToHistory(v('b'));
    lists.clearCollections(['favorites']);
    expect(collections.get().favorites).toEqual([]);
    expect(collections.get().history).toHaveLength(1);
    lists.clearCollections();
    expect(collections.get().history).toEqual([]);
    function View() { return <span>{lists.useCollections().favorites.length}</span>; }
    render(<View />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('following', () => {
  it('returns nothing without an account', async () => {
    const following = await import('./following');
    expect(await following.getSubscriptions()).toEqual([]);
    expect(await following.setFollowing('c', '@c', true)).toBe(false);
    expect(await following.isFollowing('c')).toBe(false);
  });

  it('lists subscriptions and builds the following feed', async () => {
    await loginAs();
    const following = await import('./following');
    const spy = mockFetch((url, init) => {
      if (url.includes('/subscription/list')) return { success: true, data: [{ claim_id: 'c1', channel_name: '@one' }, { claim_id: 'c2' }] };
      expect(JSON.parse(String(init?.body)).params.channel_ids).toEqual(['c1', 'c2']);
      return rpcResult({ items: [claim('a')] });
    });
    expect(await following.getSubscriptions()).toHaveLength(2);
    expect((await following.getFollowingVideos(1, 20)).map((entry) => entry.id)).toEqual(['a']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns an empty feed when nobody is followed and tolerates failures', async () => {
    await loginAs();
    const following = await import('./following');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => ({ success: true, data: [] }));
    expect(await following.getFollowingVideos()).toEqual([]);
    vi.resetModules();
    await loginAs();
    const again = await import('./following');
    mockFetch(() => ({ success: false }));
    expect(await again.getSubscriptions()).toEqual([]);
  });

  it('follows and unfollows through both the subscription api and preferences', async () => {
    await loginAs();
    const following = await import('./following');
    const prefs: { following: { uri: string }[] } = { following: [{ uri: 'lbry://@old#o1' }] };
    const calls: string[] = [];
    mockFetch((url, init) => {
      if (url.includes('/subscription/')) { calls.push(url.split('/').pop() as string); return { success: true }; }
      const { method, params } = JSON.parse(String(init?.body));
      if (method === 'preference_get') return rpcResult({ shared: { value: prefs } });
      prefs.following = JSON.parse(params.value).value.following;
      return rpcResult({});
    });
    expect(await following.setFollowing('c1', '@one', true)).toBe(true);
    expect(prefs.following.map((entry) => entry.uri)).toEqual(['lbry://@old#o1', 'lbry://@one#c1']);
    expect(await following.isFollowing('c1')).toBe(true);
    expect(await following.setFollowing('c1', '@one', false)).toBe(true);
    expect(prefs.following.map((entry) => entry.uri)).toEqual(['lbry://@old#o1']);
    expect(calls).toEqual(['new', 'delete']);
  });

  it('reports api refusals and network errors', async () => {
    await loginAs();
    const following = await import('./following');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => ({ success: false }));
    expect(await following.setFollowing('c1', '@one', true)).toBe(false);
    mockFetch(() => { throw new Error('offline'); });
    expect(await following.setFollowing('c1', '@one', true)).toBe(false);
  });
});

describe('browse feeds', () => {
  it('builds queries for discover, categories and channels', async () => {
    const feeds = await import('./browse-feeds');
    expect(feeds.discoverFeed(2)).toMatchObject({ order: 'trending', days: 30, page: 2, pageSize: feeds.FEED_PAGE_SIZE });
    const category = { id: 'X', label: 'X', icon: '', channelIds: ['a'], pageSize: 12, days: 60, sortOrder: 1 };
    expect(feeds.categoryFeed(category, 1)).toEqual({ channelIds: ['a'], order: 'trending', days: 60, pageSize: 12, page: 1 });
    expect(feeds.categoryFeed(category, 1, 40).pageSize).toBe(40);
    expect(feeds.channelFeed('c', 3)).toEqual({ channelIds: ['c'], order: 'new', pageSize: feeds.FEED_PAGE_SIZE, page: 3 });
  });
});
