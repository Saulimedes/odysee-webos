import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@/entities/video';
import { bufferedRange, collectStats, nextRate, type StatsContext } from './playbackStats';

type Props = Record<string, unknown>;

function element(props: Props = {}, ranges: [number, number][] = []) {
  const video = document.createElement('video');
  const buffered = { length: ranges.length, start: (index: number) => ranges[index][0], end: (index: number) => ranges[index][1] };
  const defaults: Props = { currentTime: 10, duration: 100, paused: false, ended: false, readyState: 4, networkState: 2, volume: 1, muted: false, videoWidth: 1280, videoHeight: 720, buffered, currentSrc: 'https://cdn.lbryplayer.xyz/api/v3/streams/free/name/id/abc' };
  Object.entries({ ...defaults, ...props }).forEach(([key, value]) => Object.defineProperty(video, key, { value, configurable: true, writable: true }));
  return video;
}

const video = { id: 'abcdef1234567890', title: 'T', thumb: null, duration: 100, height: 720, releaseTime: 1, channelName: 'c', channelTitle: 'c', claimName: 'my-video', size: 12500000, mediaType: 'video/mp4' } as Video;
const context = (extra: Partial<StatsContext> = {}): StatsContext => ({ video, quality: 'auto', aspect: 'auto', speed: 1, buffering: false, sourceUrl: 'https://cdn.lbryplayer.xyz/x', version: '1.2.3', ...extra });
const value = (rows: { label: string; value: string }[], label: string) => rows.find((row) => row.label === label)?.value;

afterEach(() => { vi.unstubAllGlobals(); });

describe('bufferedRange', () => {
  it('finds the range around the position, or none', () => {
    expect(bufferedRange(element({}, [[0, 5], [8, 40]]))).toEqual({ start: 8, end: 40 });
    expect(bufferedRange(element({ currentTime: 6 }, [[0, 5], [8, 40]]))).toEqual({ start: 6, end: 6 });
  });
});

describe('nextRate', () => {
  it('starts over without a previous sample, after a seek or when time stands still', () => {
    const playing = element({ currentTime: 12 }, [[0, 30]]);
    expect(nextRate(null, 1000, playing).fill).toBe(0);
    const first = nextRate(null, 1000, element({ currentTime: 10 }, [[0, 20]]));
    expect(nextRate(first, 1000, playing).fill).toBe(0);
    expect(nextRate(first, 2000, element({ currentTime: 80 }, [[0, 90]])).fill).toBe(0);
    expect(nextRate(first, 2000, element({ currentTime: 11 }, [[5, 20]])).fill).toBe(0);
    expect(nextRate(first, 2000, element({ currentTime: 5 }, [[0, 20]])).fill).toBe(0);
  });

  it('measures how many seconds of video arrived per second', () => {
    const first = nextRate(null, 1000, element({ currentTime: 10 }, [[0, 20]]));
    expect(nextRate(first, 2000, element({ currentTime: 11 }, [[0, 24]])).fill).toBe(4);
    expect(nextRate(first, 2000, element({ currentTime: 11 }, [[0, 20.001]])).fill).toBe(0);
    const fast = nextRate(nextRate(null, 0, element({ currentTime: 10 }, [[0, 20]])), 1000, element({ currentTime: 13, playbackRate: 2 }, [[0, 22]]), 2);
    expect(fast.fill).toBe(2);
  });
});

describe('collectStats', () => {
  it('describes the video, the stream and the screen', () => {
    const rows = collectStats(element({}, [[0, 40]]), context(), { at: 0, time: 0, start: 0, end: 0, fill: 3.25 });
    expect(value(rows, 'Video')).toBe('abcdef1234 (my-video)');
    expect(value(rows, 'Stream')).toBe('original file from cdn.lbryplayer.xyz');
    expect(value(rows, 'File')).toBe('video/mp4, 11.9 MB');
    expect(value(rows, 'Bitrate')).toBe('about 1.00 Mbit/s (original file)');
    expect(value(rows, 'Resolution')).toBe('1280x720 (listed 720p)');
    expect(value(rows, 'Aspect')).toBe('1.78 (auto)');
    expect(value(rows, 'Viewport')).toMatch(/^\d+x\d+ @1x$/);
    expect(value(rows, 'Buffer')).toBe('30.0 s ahead, 1 range');
    expect(value(rows, 'Buffer fill')).toBe('3.3x realtime');
    expect(value(rows, 'Position')).toBe('0:10 / 1:40');
    expect(value(rows, 'State')).toBe('playing, 1x, enough data, network loading');
    expect(value(rows, 'Volume')).toBe('player 100%');
    expect(value(rows, 'Display')).toBe('browser, object-fit');
    expect(value(rows, 'Engine')).toMatch(/app 1\.2\.3$/);
  });

  it('names transcoded streams and copes with missing details', () => {
    const bare = { ...video, size: undefined, mediaType: undefined, height: 0 } as Video;
    const rows = collectStats(element({ videoWidth: 0, videoHeight: 0, duration: Number.NaN, currentSrc: '', paused: true, muted: true, volume: 0.5, readyState: 9, networkState: 9, buffered: { length: 2, start: () => 0, end: () => 0 } }), context({ video: bare, quality: '720', sourceUrl: 'not a url', speed: 1.25 }), null);
    expect(value(rows, 'Stream')).toBe('transcoded 720p from unknown');
    expect(value(rows, 'File')).toBe('unknown');
    expect(value(rows, 'Bitrate')).toBe('unknown');
    expect(value(rows, 'Resolution')).toBe('waiting for the video');
    expect(value(rows, 'Aspect')).toBe('- (auto)');
    expect(value(rows, 'Buffer')).toContain('2 ranges');
    expect(value(rows, 'Buffer fill')).toBe('buffer full or idle');
    expect(value(rows, 'Position')).toBe('0:10 / 1:40');
    expect(value(rows, 'State')).toBe('paused, 1.25x, 9, network 9');
    expect(value(rows, 'Volume')).toBe('player 50% (muted)');
  });

  it('reports the state, frames and connection', () => {
    expect(value(collectStats(element({ ended: true }), context(), null), 'State')).toContain('ended');
    expect(value(collectStats(element({}), context({ buffering: true }), null), 'State')).toContain('buffering');
    const dropped = element({ getVideoPlaybackQuality: () => ({ totalVideoFrames: 500, droppedVideoFrames: 7 }) });
    expect(value(collectStats(dropped, context(), null), 'Frames')).toBe('7 dropped of 500');
    const legacy = element({ webkitDecodedFrameCount: 90, webkitDroppedFrameCount: 2 });
    expect(value(collectStats(legacy, context(), null), 'Frames')).toBe('2 dropped of 90');
    expect(value(collectStats(element(), context(), null), 'Frames')).toBe('not reported by this TV');
    expect(value(collectStats(element(), context(), null), 'Connection')).toBe('not reported by this TV');
    Object.defineProperty(navigator, 'connection', { value: { downlink: 25, effectiveType: '4g', rtt: 50 }, configurable: true });
    expect(value(collectStats(element(), context(), null), 'Connection')).toBe('about 25 Mbit/s, 4g, 50 ms');
    Object.defineProperty(navigator, 'connection', { value: { downlink: 3 }, configurable: true });
    expect(value(collectStats(element(), context(), null), 'Connection')).toBe('about 3 Mbit/s');
    delete (navigator as unknown as { connection?: unknown }).connection;
  });

  it('shows how the picture is drawn on a TV', () => {
    vi.stubGlobal('PalmServiceBridge', class {});
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/68.0.3440.106 WebAppManager');
    expect(value(collectStats(element({ mediaId: 'm1' }), context(), null), 'Display')).toBe('webOS, media id set, TV output service crops and stretches');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/120.0 WebAppManager');
    expect(value(collectStats(element(), context(), null), 'Display')).toBe('webOS, no media id, object-fit');
    expect(value(collectStats(element(), context(), null), 'Engine')).toContain('Chrome 120');
  });
});
