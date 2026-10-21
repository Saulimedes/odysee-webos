import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, mockFetch, rpcResult, video } from '../../../tests/helpers';
import { normalizeVideo, normalizeVideos, parseClaim } from './model/claim';
import { streamUrl } from './lib/media';
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

describe('streamUrl', () => {
  const sample = video('id1') as Video;
  it('uses the free stream for auto quality', () => expect(streamUrl(sample)).toBe('https://cdn.lbryplayer.xyz/api/v3/streams/free/name-id1/id1/abcdef'));
  it('uses the transcoded endpoint for explicit qualities', () => expect(streamUrl(sample, '720')).toBe('https://cdn.lbryplayer.xyz/api/v4/streams/tc/name-id1/id1/abcdef?quality=720p'));
  it('falls back on bad quality values and missing hashes', () => {
    expect(streamUrl(sample, 'weird')).toContain('/v3/');
    expect(streamUrl({ ...sample, hash: undefined })).toMatch(/id1\/$/);
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
});
