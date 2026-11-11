import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, mockFetch, rpcResult, video } from '../../../tests/helpers';
import { normalizeVideo, normalizeVideos, parseClaim } from './model/claim';
import { bestVariant, fileUrl, playlistUrl } from './lib/media';
import { VideoCard } from './ui/VideoCard';
import type { Video } from './model/types';

describe('parseClaim', () => {
  it('maps a claim to a trimmed video', () => {
    const parsed = parseClaim(claim('abc', 'Hello') as never);
    expect(parsed).toMatchObject({ id: 'abc', title: 'Hello', duration: 120, height: 720, channelId: 'chan', channelName: 'chan', channelTitle: 'Channel', releaseTime: 1700000100, claimName: 'name-abc' });
    expect(parsed).not.toHaveProperty('hash');
    expect(parsed.sdHash).toBeUndefined();
    expect(parseClaim(claim('abc', 'Hello', { value: { source: { sd_hash: 'sd1' } } }) as never).sdHash).toBe('sd1');
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
    const migrated = normalizeVideo({ id: 'o', title: 'Old', thumbnail: 'https://x/t.png', channelThumbnail: 'https://x/c.png', _claimName: 'old-name', duration: '90' });
    expect(migrated).toMatchObject({ id: 'o', thumb: 'https://x/t.png', channelThumb: 'https://x/c.png', claimName: 'old-name', duration: 90 });
  });

  it('rejects unusable entries', () => {
    expect(normalizeVideo(null)).toBeNull();
    expect(normalizeVideo({ title: 'no id' })).toBeNull();
    expect(normalizeVideo({ id: 'x' })).toBeNull();
    expect(normalizeVideos('nope')).toEqual([]);
    expect(normalizeVideos([video('a'), { id: 1 }])).toHaveLength(1);
  });

  it('keeps the source hash when it is a string', () => {
    expect(normalizeVideo(video('a', { sdHash: 'sd1' }))?.sdHash).toBe('sd1');
    expect(normalizeVideo(video('a', { sdHash: 5 }))?.sdHash).toBeUndefined();
    expect(normalizeVideo(video('a', { sdHash: '' }))?.sdHash).toBeUndefined();
  });

  it('fills defaults', () => {
    expect(normalizeVideo({ id: 'a', claimName: 'n' })).toMatchObject({ title: 'Untitled', channelName: 'Anonymous', channelTitle: 'Anonymous', thumb: null, duration: 0 });
    expect(normalizeVideo({ id: 'a', claimName: 'n', channelName: 'x' })?.channelTitle).toBe('x');
  });
});

describe('fileUrl', () => {
  const sample = video('id1') as Video;

  it('plays the original through the signed redirect of the website', () => {
    expect(fileUrl(sample)).toBe('https://odysee.com/$/download/name-id1/id1');
  });

  it('writes claim names so they stay one path segment', () => {
    expect(fileUrl({ ...sample, claimName: 'a b\u00e9' })).toBe('https://odysee.com/$/download/a%20b%C3%A9/id1');
  });
});

describe('playlistUrl', () => {
  it('names the transcoded copy of the stream server by claim and source hash', () => {
    expect(playlistUrl(video('id1') as Video, 'sd1')).toBe('https://player.odycdn.com/v6/streams/id1/sd1/master.m3u8');
  });
});

describe('bestVariant', () => {
  const BASE = 'https://player.odycdn.com/v6/streams/id1/sd1/master.m3u8';
  const entry = (bandwidth: number, uri: string, extra = '') => `#EXT-X-STREAM-INF:${extra}BANDWIDTH=${bandwidth},RESOLUTION=1x1\n${uri}`;

  it('picks the rendition with the highest bandwidth wherever it is listed, next to the master', () => {
    expect(bestVariant(`#EXTM3U\n${entry(300, 'v3.m3u8')}\n\n${entry(4000, 'v0.m3u8')}\n\n${entry(900, 'v2.m3u8')}\n`, BASE)).toBe('https://player.odycdn.com/v6/streams/id1/sd1/v0.m3u8');
  });

  it('reads absolute addresses and Windows line ends, and does not take the average for the peak', () => {
    const master = ['#EXTM3U', entry(100, 'low.m3u8'), entry(200, 'https://cdn.example/high.m3u8', 'AVERAGE-BANDWIDTH=9000,'), ''].join('\r\n');
    expect(bestVariant(master, BASE)).toBe('https://cdn.example/high.m3u8');
  });

  it('finds nothing in a playlist without usable renditions', () => {
    expect(bestVariant('#EXTM3U\n', BASE)).toBeUndefined();
    expect(bestVariant('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1x1\nv0.m3u8\n', BASE)).toBeUndefined();
    expect(bestVariant('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5\n#EXT-X-ENDLIST\n', BASE)).toBeUndefined();
    expect(bestVariant('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5', BASE)).toBeUndefined();
  });
});

describe('resolveSource', () => {
  const PLAYLIST = 'https://player.odycdn.com/v6/streams/id1/sd1/master.m3u8';
  const START = 'https://player.odycdn.com/v6/streams/id1/sd1/v0.m3u8';
  const MASTER_TEXT = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=215600,RESOLUTION=256x144\nv3.m3u8\n\n#EXT-X-STREAM-INF:BANDWIDTH=4026000,RESOLUTION=1920x1080,CODECS="avc1.4d402a,mp4a.40.2"\nv0.m3u8\n';
  const known = video('id1', { sdHash: 'sd1' }) as Video;
  const playlist = (status = 200, type = 'application/x-mpegurl', body = MASTER_TEXT) => new Response(status === 200 ? body : null, { status, headers: { 'Content-Type': type } });
  let resolveSource: typeof import('./lib/media').resolveSource;

  beforeEach(async () => {
    vi.resetModules();
    ({ resolveSource } = await import('./lib/media'));
  });

  it('asks the stream server for the transcoded copy and starts on its best rendition when there is one', async () => {
    const spy = mockFetch(() => playlist());
    expect(await resolveSource(known)).toEqual({ kind: 'hls', url: PLAYLIST, start: START });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(PLAYLIST);
    expect(spy.mock.calls[0][1]).not.toHaveProperty('method');
    expect(spy.mock.calls[0][1]).not.toHaveProperty('cache');
  });

  it('plays the file when the playlist names no rendition', async () => {
    mockFetch(() => playlist(200, 'application/x-mpegurl', '#EXTM3U\n'));
    expect(await resolveSource(known)).toEqual({ kind: 'file', url: fileUrl(known) });
  });

  it('plays the file when there is no transcoded copy, and does not ask again for a while', async () => {
    const spy = mockFetch(() => playlist(404));
    expect(await resolveSource(known)).toEqual({ kind: 'file', url: fileUrl(known) });
    expect(await resolveSource(known)).toEqual({ kind: 'file', url: fileUrl(known) });
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await resolveSource(known);
    vi.useRealTimers();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that is not a playlist for one', async () => {
    mockFetch(() => playlist(200, 'text/plain'));
    expect(await resolveSource(known)).toEqual({ kind: 'file', url: fileUrl(known) });
  });

  it('treats 403 like a missing copy', async () => {
    mockFetch(() => playlist(403));
    expect((await resolveSource(known)).kind).toBe('file');
  });

  it('plays the file when the server refuses the lookup, and asks again next time since a refusal is not a missing copy', async () => {
    const spy = mockFetch(() => playlist(429, 'text/plain'));
    expect(await resolveSource(known)).toEqual({ kind: 'file', url: fileUrl(known) });
    spy.mockImplementation(async () => playlist());
    expect((await resolveSource(known)).kind).toBe('hls');
  });

  it('plays the file when the server fails or cannot be reached', async () => {
    const spy = mockFetch(() => playlist(503));
    expect((await resolveSource(known)).kind).toBe('file');
    spy.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    expect((await resolveSource(known)).kind).toBe('file');
    spy.mockImplementation(async () => playlist());
    expect((await resolveSource(known)).kind).toBe('hls');
  });

  it('asks the claim for its source hash once when the video was stored without it', async () => {
    const withHash = claim('id1', 'T', { value: { title: 'T', source: { sd_hash: 'fromclaim' } } });
    const spy = mockFetch((url) => (url.includes('player.odycdn.com') ? playlist() : rpcResult({ items: [withHash] })));
    const bare = video('id1') as Video;
    expect(await resolveSource(bare)).toEqual({ kind: 'hls', url: 'https://player.odycdn.com/v6/streams/id1/fromclaim/master.m3u8', start: 'https://player.odycdn.com/v6/streams/id1/fromclaim/v0.m3u8' });
    await resolveSource(bare);
    expect(spy.mock.calls.filter(([url]) => String(url).includes('proxy'))).toHaveLength(1);
  });

  it('plays the file without asking when no source hash can be found', async () => {
    const spy = mockFetch(() => rpcResult({ items: [claim('id1')] }));
    expect(await resolveSource(video('id1') as Video)).toEqual({ kind: 'file', url: fileUrl(known) });
    spy.mockImplementation(async () => { throw new TypeError('offline'); });
    expect((await resolveSource(video('id2') as Video)).kind).toBe('file');
    expect(spy.mock.calls.some(([url]) => String(url).includes('player.odycdn.com'))).toBe(false);
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

  it('asks for at most 50 claim ids at a time, because the API silently cuts longer lists', async () => {
    const { resolveVideos } = await import('./api/queries');
    const sizes: number[] = [];
    mockFetch((_url, init) => {
      const { claim_ids: ids, page_size: pageSize } = JSON.parse(String(init?.body)).params;
      sizes.push(ids.length);
      expect(pageSize).toBeLessThanOrEqual(50);
      return rpcResult({ items: ids.map((id: string) => claim(id)) });
    });
    const ids = Array.from({ length: 120 }, (_, index) => `id${index}`);
    const videos = await resolveVideos(ids);
    expect(videos.map((entry) => entry.id)).toEqual(ids);
    expect(sizes.sort((a, b) => a - b)).toEqual([20, 50, 50]);
  });

  it('asks for the chunks of a long list at the same time, unless it is a background lookup', async () => {
    const { resolveVideos } = await import('./api/queries');
    let running = 0;
    let most = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const { params } = JSON.parse(String(init?.body));
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return new Response(JSON.stringify(rpcResult({ items: params.claim_ids.map((id: string) => claim(id)) })), { status: 200 });
    }));
    const ids = Array.from({ length: 120 }, (_, index) => `p${index}`);
    await resolveVideos(ids);
    expect(most).toBeGreaterThan(1);
    most = 0;
    expect((await resolveVideos(ids.map((id) => `b${id}`), { background: true })).map((entry) => entry.id)).toEqual(ids.map((id) => `b${id}`));
    expect(most).toBe(1);
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
