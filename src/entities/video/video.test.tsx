import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, mockFetch, rpcResult, video } from '../../../tests/helpers';
import { normalizeVideo, normalizeVideos, parseClaim } from './model/claim';
import { streamSources } from './lib/media';
import { VideoCard } from './ui/VideoCard';
import type { Video } from './model/types';

describe('parseClaim', () => {
  it('maps a claim to a trimmed video', () => {
    const parsed = parseClaim(claim('abc', 'Hello') as never);
    expect(parsed).toMatchObject({ id: 'abc', title: 'Hello', duration: 120, height: 720, channelId: 'chan', channelName: 'chan', channelTitle: 'Channel', releaseTime: 1700000100, hash: 'abcdef123456', claimName: 'name-abc' });
    expect(parsed).not.toHaveProperty('description');
  });

  it('falls back for sparse claims', () => {
    const parsed = parseClaim({ claim_id: 'x', name: 'slug', timestamp: 5 });
    expect(parsed).toMatchObject({ title: 'slug', thumb: null, duration: 0, channelName: 'Anonymous', channelTitle: 'Anonymous', releaseTime: 5 });
    expect(parseClaim({ claim_id: 'y', name: 'n', value: {}, signing_channel: { name: '@a' } }).channelTitle).toBe('a');
    expect(parseClaim({ claim_id: 'z', name: '' }).title).toBe('Untitled');
  });
});

describe('normalizeVideo', () => {
  it('accepts the current shape', () => expect(normalizeVideo(video('a'))).toMatchObject({ id: 'a', thumb: 'https://thumbs.odycdn.com/a.webp' }));

  it('migrates the old stored shape', () => {
    const migrated = normalizeVideo({ id: 'o', title: 'Old', thumbnail: 'https://x/t.png', channelThumbnail: 'https://x/c.png', _claimName: 'old-name', _sourceHash: 'h', duration: '90' });
    expect(migrated).toMatchObject({ id: 'o', thumb: 'https://x/t.png', channelThumb: 'https://x/c.png', claimName: 'old-name', hash: 'h', duration: 90 });
  });

  it('rejects unusable entries', () => {
    expect(normalizeVideo(null)).toBeNull();
    expect(normalizeVideo({ title: 'no id' })).toBeNull();
    expect(normalizeVideo({ id: 'x' })).toBeNull();
    expect(normalizeVideos('nope')).toEqual([]);
    expect(normalizeVideos([video('a'), { id: 1 }])).toHaveLength(1);
  });

  it('fills defaults', () => {
    expect(normalizeVideo({ id: 'a', claimName: 'n' })).toMatchObject({ title: 'Untitled', channelName: 'Anonymous', channelTitle: 'Anonymous', thumb: null, duration: 0 });
    expect(normalizeVideo({ id: 'a', claimName: 'n', channelName: 'x' })?.channelTitle).toBe('x');
  });
});

describe('streamSources', () => {
  const sample = video('id1') as Video;
  const original = 'https://odysee.com/$/download/name-id1/id1';
  const legacy = 'https://cdn.lbryplayer.xyz/api/v3/streams/free/name-id1/id1/abcdef';

  it('plays the original through the signed redirect of the website, with the old host as the last resort', () => {
    expect(streamSources(sample)).toEqual([original, legacy]);
  });

  it('tries the transcoded endpoint first for explicit qualities', () => {
    expect(streamSources(sample, '720')).toEqual(['https://cdn.lbryplayer.xyz/api/v4/streams/tc/name-id1/id1/abcdef?quality=720p', original, legacy]);
  });

  it('falls back on bad quality values and missing hashes', () => {
    expect(streamSources(sample, 'weird')).toEqual([original, legacy]);
    expect(streamSources({ ...sample, hash: undefined })[1]).toMatch(/id1\/$/);
  });

  it('writes claim names so they stay one path segment', () => {
    expect(streamSources({ ...sample, claimName: 'a b\u00e9' })[0]).toBe('https://odysee.com/$/download/a%20b%C3%A9/id1');
  });
});

describe('queries', () => {
  beforeEach(() => { vi.resetModules(); });

  it('builds claim_search parameters and parses results', async () => {
    const { queryClaims } = await import('./api/queries');
    const spy = mockFetch(() => rpcResult({ items: [claim('a'), claim('b')] }));
    const videos = await queryClaims({ channelIds: ['c1'], order: 'new', days: 30, page: 2, pageSize: 5 });
    expect(videos.map((entry) => entry.id)).toEqual(['a', 'b']);
    const params = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).params;
    expect(params).toMatchObject({ channel_ids: ['c1'], page: 2, page_size: 5, order_by: ['release_time'], fee_amount: '<=0', stream_types: ['video'] });
    expect(params.release_time).toMatch(/^>\d+$/);
    expect(params.not_tags).toContain('porn');
  });

  it('caches identical queries', async () => {
    const { queryClaims } = await import('./api/queries');
    const spy = mockFetch(() => rpcResult({ items: [claim('a')] }));
    await queryClaims({ channelIds: ['c1'] });
    await queryClaims({ channelIds: ['c1'] });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('drops the tag filter when mature content is allowed and uses trending by default', async () => {
    localStorage.setItem('nsfw', 'true');
    const { buildParams } = await import('./api/queries');
    const params = buildParams({});
    expect(params).not.toHaveProperty('not_tags');
    expect(params.order_by).toEqual(['trending_group', 'trending_mixed']);
    expect(buildParams({ order: 'top' }).order_by).toEqual(['effective_amount']);
  });

  describe('like Odysee asks for claims', () => {
    it('limits the claims per channel, leaves out shorts, picks languages and wants a source', async () => {
      const { buildParams } = await import('./api/queries');
      const params = buildParams({ channelIds: ['c1'], limitPerChannel: 2, excludeShorts: true, languages: ['en', 'de'] });
      expect(params).toMatchObject({ limit_claims_per_channel: 2, exclude_shorts: true, any_languages: ['en', 'de'], has_source: true, claim_type: ['stream'], fee_amount: '<=0', no_totals: true });
    });

    it('sends none of these when the category does not name them', async () => {
      const { buildParams } = await import('./api/queries');
      const params = buildParams({ channelIds: ['c1'], languages: [] });
      expect(params).not.toHaveProperty('limit_claims_per_channel');
      expect(params).not.toHaveProperty('exclude_shorts');
      expect(params).not.toHaveProperty('any_languages');
      expect(buildParams({ channelIds: ['c1'], limitPerChannel: 0, excludeShorts: false })).not.toHaveProperty('limit_claims_per_channel');
    });

    it('leaves out channels for a category that has no channels of its own, like Wild West', async () => {
      const { buildParams } = await import('./api/queries');
      expect(buildParams({ excludedChannelIds: ['x', 'y'], limitPerChannel: 1 })).toMatchObject({ not_channel_ids: ['x', 'y'], limit_claims_per_channel: 1 });
      expect(buildParams({ excludedChannelIds: ['x'] })).not.toHaveProperty('channel_ids');
      expect(buildParams({ excludedChannelIds: [] })).not.toHaveProperty('not_channel_ids');
      expect(buildParams({})).not.toHaveProperty('not_channel_ids');
    });

    it('does not mix up queries that only differ in the channels left out', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      mockFetch((_url, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return rpcResult({ items: [claim(`id-${(body.params.not_channel_ids || []).join('')}`)] });
      });
      const [first, second] = await Promise.all([queryClaims({ excludedChannelIds: ['a'] }), queryClaims({ excludedChannelIds: ['b'] })]);
      expect(first[0].id).toBe('id-a');
      expect(second[0].id).toBe('id-b');
      expect(peekClaims({ excludedChannelIds: ['a'] })?.videos[0].id).toBe('id-a');
      expect(peekClaims({ excludedChannelIds: ['c'] })).toBeUndefined();
    });

    it('names claims by id without the feed options', async () => {
      const { buildParams } = await import('./api/queries');
      const params = buildParams({ claimIds: ['a', 'b'], limitPerChannel: 1, excludeShorts: true });
      expect(params).toMatchObject({ claim_ids: ['a', 'b'], page_size: 2 });
      expect(params).not.toHaveProperty('has_source');
      expect(params).not.toHaveProperty('exclude_shorts');
    });

    it('asks for the three orders', async () => {
      const { buildParams } = await import('./api/queries');
      expect(buildParams({ order: 'trending' }).order_by).toEqual(['trending_group', 'trending_mixed']);
      expect(buildParams({ order: 'new' }).order_by).toEqual(['release_time']);
      expect(buildParams({ order: 'top' }).order_by).toEqual(['effective_amount']);
    });

    it('rounds the start of the period to the full hour, so that repeated queries are the same for the server', async () => {
      const { buildParams } = await import('./api/queries');
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-11-10T13:41:27Z'));
        const at = (days: number) => Number(String(buildParams({ days }).release_time).slice(1));
        const expected = Date.parse('2026-10-11T13:00:00Z') / 1000;
        expect(at(30)).toBe(expected);
        vi.setSystemTime(new Date('2026-11-10T13:59:59Z'));
        expect(at(30)).toBe(expected);
        vi.setSystemTime(new Date('2026-11-10T14:00:00Z'));
        expect(at(30)).toBe(expected + 3600);
        expect(at(30) % 3600).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not ask for a period when the feed names none', async () => {
      const { buildParams } = await import('./api/queries');
      expect(buildParams({ channelIds: ['c1'] })).not.toHaveProperty('release_time');
    });

    it('sends the same request again within the hour, which the server can answer from its cache', async () => {
      const { queryClaims } = await import('./api/queries');
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const spy = mockFetch(() => rpcResult({ items: [claim('a')] }));
        vi.setSystemTime(new Date('2026-11-10T13:05:00Z'));
        await queryClaims({ channelIds: ['c1'], days: 30, limitPerChannel: 1, pageSize: 12 });
        vi.setSystemTime(new Date('2026-11-10T13:45:00Z'));
        await queryClaims({ channelIds: ['c1'], days: 30, limitPerChannel: 1, pageSize: 12, page: 2 });
        const bodies = spy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).params);
        expect(bodies[1].release_time).toBe(bodies[0].release_time);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('cache key', () => {
    const feed = () => ({ channelIds: Array.from({ length: 300 }, (_, index) => `channel-${index}`), days: 30, order: 'trending' as const, page: 1, pageSize: 12, limitPerChannel: 1, excludeShorts: true, languages: ['en'] });

    it('is the same for the same query, whichever objects describe it', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      const spy = mockFetch(() => rpcResult({ items: [claim('a')] }));
      await queryClaims(feed(), { persist: true });
      expect(peekClaims(feed())?.videos).toHaveLength(1);
      await queryClaims(feed());
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('differs when the channels or any option of the query differ', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      mockFetch(() => rpcResult({ items: [claim('a')] }));
      await queryClaims(feed());
      const base = feed();
      const changed = [
        { ...base, channelIds: base.channelIds.slice().reverse() },
        { ...base, channelIds: base.channelIds.slice(0, 299) },
        { ...base, limitPerChannel: 2 },
        { ...base, limitPerChannel: undefined },
        { ...base, excludeShorts: false },
        { ...base, languages: ['de'] },
        { ...base, languages: undefined },
        { ...base, order: 'new' as const },
        { ...base, days: 60 },
        { ...base, page: 2 },
        { ...base, pageSize: 40 },
      ];
      changed.forEach((other) => expect(peekClaims(other)).toBeUndefined());
      expect(peekClaims(base)).toBeDefined();
    });

    it('depends on the mature content setting', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      mockFetch(() => rpcResult({ items: [claim('a')] }));
      await queryClaims(feed());
      expect(peekClaims(feed())).toBeDefined();
      const { setSetting } = await import('@/shared/config');
      setSetting('nsfw', true);
      expect(peekClaims(feed())).toBeUndefined();
      setSetting('nsfw', false);
    });

    it('goes through the channel list once per list, not on every peek', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      mockFetch(() => rpcResult({ items: [claim('a')] }));
      const query = feed();
      const join = vi.spyOn(query.channelIds, 'join');
      await queryClaims(query);
      const original = JSON.stringify;
      const stringify = vi.spyOn(JSON, 'stringify');
      for (let index = 0; index < 20; index++) peekClaims({ ...query, page: 1 });
      expect(join).toHaveBeenCalledTimes(1);
      expect(stringify).toHaveBeenCalledTimes(20);
      stringify.mock.calls.forEach(([value]) => expect(original(value).length).toBeLessThan(200));
      stringify.mockRestore();
    });

    it('hashes a new list again, and leaves feeds without channels alone', async () => {
      const { queryClaims, peekClaims } = await import('./api/queries');
      mockFetch(() => rpcResult({ items: [claim('a')] }));
      await queryClaims({ order: 'trending', days: 30 });
      expect(peekClaims({ order: 'trending', days: 30 })).toBeDefined();
      expect(peekClaims({ order: 'trending', days: 30, channelIds: ['x'] })).toBeUndefined();
    });
  });

  it('resolves claim ids in order and skips missing ones', async () => {
    const { resolveVideos } = await import('./api/queries');
    mockFetch(() => rpcResult({ items: [claim('b'), claim('a')] }));
    expect((await resolveVideos(['a', 'missing', 'b'])).map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(await resolveVideos([])).toEqual([]);
  });

  it('skips empty id lists and peeks persisted rows', async () => {
    const { queryClaims, peekClaims } = await import('./api/queries');
    const spy = mockFetch(() => rpcResult({ items: [claim('a')] }));
    expect(await queryClaims({ claimIds: [] })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    const feed = { channelIds: ['c9'], pageSize: 3 };
    expect(peekClaims(feed)).toBeUndefined();
    await queryClaims(feed, { persist: true, background: true });
    expect(peekClaims(feed)?.videos).toHaveLength(1);
  });
});

describe('VideoCard', () => {
  it('renders details and reports selection', () => {
    const onSelect = vi.fn();
    render(<VideoCard video={video('a') as Video} index={3} active thumbWidth={400} progress={40} onSelect={onSelect} />);
    expect(screen.getByText('Video a')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Video a'));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(document.querySelector('.card--active')).not.toBeNull();
    expect((document.querySelector('.card__progress i') as HTMLElement).style.width).toBe('40%');
  });

  it('omits the duration and progress when unknown', async () => {
    render(<VideoCard video={video('a', { duration: 0 }) as Video} index={0} active={false} thumbWidth={400} onSelect={() => {}} />);
    await waitFor(() => expect(document.querySelector('.card__duration')).toBeNull());
    expect(document.querySelector('.card__progress')).toBeNull();
  });

  it('plays a moving thumbnail only while its card has the focus', () => {
    vi.useFakeTimers();
    try {
      const moving = video('m', { thumb: 'https://thumbs.odycdn.com/m.webp' }) as Video;
      const { rerender } = render(<VideoCard video={moving} index={0} active={false} thumbWidth={400} onSelect={() => {}} />);
      const src = () => (document.querySelector('.card__thumb img') as HTMLImageElement).src;
      expect(src()).toContain('/card/');
      rerender(<VideoCard video={moving} index={0} active thumbWidth={400} onSelect={() => {}} />);
      act(() => { vi.advanceTimersByTime(300); });
      expect(src()).toContain('/optimize/');
      rerender(<VideoCard video={moving} index={0} active={false} thumbWidth={400} onSelect={() => {}} />);
      expect(src()).toContain('/card/');
    } finally {
      vi.useRealTimers();
    }
  });
});
