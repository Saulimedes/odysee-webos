import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, claim, cssRules, flush, mockFetch, rpcResult, video } from '../../../tests/helpers';
import type { Video } from '@/entities/video';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { setSetting } from '@/shared/config/settings';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { getSavedPosition, savePlaybackPosition } from '@/features/playback-history';
import { hoverOver, setViewport } from '../../../tests/render';
import { Player } from './ui/Player';
import { Timeline } from './ui/Timeline';
import { useSeek } from './model/useSeek';

const hlsJs = vi.hoisted(() => {
  type Problem = { fatal: boolean; details: string };
  const state = { supported: true, beforeUse: null as (() => void) | null };
  const created: FakeHls[] = [];
  class FakeHls {
    static Events = { ERROR: 'hlsError' };
    static isSupported = () => { state.beforeUse?.(); return state.supported; };
    url = '';
    media: HTMLVideoElement | null = null;
    destroyed = false;
    private handler: ((event: string, data: Problem) => void) | null = null;
    constructor() { created.push(this); }
    on(_name: string, handler: (event: string, data: Problem) => void) { this.handler = handler; }
    loadSource(url: string) { this.url = url; }
    attachMedia(element: HTMLVideoElement) { this.media = element; }
    destroy() { this.destroyed = true; }
    fire(data: Problem) { this.handler?.('hlsError', data); }
  }
  return { state, created, FakeHls };
});
vi.mock('hls.js', () => ({ default: hlsJs.FakeHls }));

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const sample = video('vid1') as Video;
const MASTER_TEXT = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1280x720\nv0.m3u8\n';

function media() {
  return document.querySelector('video') as HTMLVideoElement;
}

function setMedia(element: HTMLVideoElement, state: { currentTime?: number; duration?: number; paused?: boolean }) {
  Object.entries(state).forEach(([key, value]) => Object.defineProperty(element, key, { value, writable: true, configurable: true }));
}

function mockApi(overrides: (url: string, init?: RequestInit) => unknown = () => undefined) {
  return mockFetch((url, init) => {
    const custom = overrides(url, init);
    if (custom !== undefined) return custom;
    if (url.includes('/reaction/list')) return { success: true, data: { reactions: { vid1: { like: 5, dislike: 2 } }, my_reactions: {} } };
    if (url.includes('/reaction/react')) return { success: true };
    if (url.includes('/subscription/')) return { success: true };
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method === 'claim_search') return rpcResult({ items: [claim('vid1'), claim('next1')] });
    if (body.method === 'preference_get') return rpcResult({ shared: { value: { following: [] } } });
    return rpcResult({});
  });
}

const setup = (props: Partial<React.ComponentProps<typeof Player>> = {}) => {
  const handlers = { onClose: vi.fn(), onPlayNext: vi.fn(), onOpenChannel: vi.fn() };
  const view = render(<Player video={sample} {...handlers} {...props} />);
  return { ...handlers, ...view };
};

beforeEach(() => {
  hlsJs.created.length = 0;
  hlsJs.state.supported = true;
  hlsJs.state.beforeUse = null;
  setViewport();
  invalidate();
  setSetting('autoplay', true);
  setSetting('resume', true);
  setSetting('aspectRatio', 'auto');
  setSetting('playbackSpeed', 1);
  setSetting('statsForNerds', false);
  setSetting('osdBackButton', true);
  forgetRemembered();
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  mockApi();
});

describe('Player playback', () => {
  it('loads the stream and shows details', () => {
    setup();
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
    expect(media().hasAttribute('crossorigin')).toBe(false);
    expect(screen.getByText('Video vid1')).toBeInTheDocument();
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    fireEvent(media(), new Event('playing'));
    expect(document.querySelector('.player__buffering')).toBeNull();
  });

  it('resumes from the saved position once metadata is known', () => {
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(120);
  });

  it('still resumes when the TV notices the metadata late, after playback has started a little', () => {
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0.000252, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(120);
  });

  it('resumes only once per load and picks up again where a failed stream stopped', () => {
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(120);
    media().currentTime = 10;
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(10);
    media().currentTime = 200;
    Object.defineProperty(media(), 'error', { value: { message: 'bad' }, configurable: true });
    fireEvent(media(), new Event('error'));
    press(13);
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(200);
  });

  it('skips resuming when the saved position is close to the end', () => {
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0, duration: 122 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(0);
  });

  it('does not resume when the setting is off', () => {
    setSetting('resume', false);
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(0);
  });

  it('saves the position on pause, periodically and when closing', () => {
    vi.useFakeTimers();
    const { unmount } = setup();
    setMedia(media(), { currentTime: 30, duration: 600, paused: false });
    fireEvent(media(), new Event('pause'));
    expect(getSavedPosition('vid1')).toBe(30);
    media().currentTime = 61;
    act(() => { vi.advanceTimersByTime(10000); });
    expect(getSavedPosition('vid1')).toBe(61);
    media().currentTime = 90;
    unmount();
    expect(getSavedPosition('vid1')).toBe(90);
  });

  it('falls back to the claim duration when the element has none', () => {
    const { unmount } = setup();
    setMedia(media(), { currentTime: 50, duration: Number.NaN });
    unmount();
    expect(getSavedPosition('vid1')).toBe(50);
  });

  it('forgets progress when the video ends and exits without autoplay', () => {
    vi.useFakeTimers();
    setSetting('autoplay', false);
    savePlaybackPosition(sample, 120, 600);
    const { onClose, onPlayNext } = setup();
    fireEvent(media(), new Event('ended'));
    act(() => { vi.advanceTimersByTime(600); });
    expect(getSavedPosition('vid1')).toBe(0);
    expect(onClose).toHaveBeenCalled();
    expect(onPlayNext).not.toHaveBeenCalled();
  });

  const settle = async () => { await act(async () => { for (let index = 0; index < 12; index++) await flush(); }); };
  const end = () => fireEvent(media(), new Event('ended'));
  const seconds = (count: number) => { for (let index = 0; index < count; index++) act(() => { vi.advanceTimersByTime(1000); }); };

  describe('autoplay', () => {
    it('counts down before it plays the next video of the list the video came from', async () => {
      const queue = [sample, video('q2') as Video, video('q3') as Video];
      const { onPlayNext, onClose } = setup({ queue });
      await settle();
      vi.useFakeTimers();
      end();
      expect(screen.getByText('Up next')).toBeInTheDocument();
      expect(screen.getByText('Video q2')).toBeInTheDocument();
      expect(screen.getByText('Playing in 5 s')).toBeInTheDocument();
      seconds(3);
      expect(screen.getByText('Playing in 2 s')).toBeInTheDocument();
      expect(onPlayNext).not.toHaveBeenCalled();
      seconds(2);
      expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByText('Up next')).toBeNull();
    });

    it('plays the next video at once on OK and lets Back cancel the countdown', async () => {
      const queue = [sample, video('q2') as Video];
      const { onPlayNext, onClose } = setup({ queue });
      await settle();
      vi.useFakeTimers();
      end();
      press(37);
      expect(onPlayNext).not.toHaveBeenCalled();
      press(13);
      expect(onPlayNext).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Up next')).toBeNull();
      end();
      press(461);
      expect(screen.queryByText('Up next')).toBeNull();
      seconds(8);
      expect(onPlayNext).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      end();
      press(413);
      expect(screen.queryByText('Up next')).toBeNull();
    });

    it('goes on with a related video when the list is over, and skips what was already watched', async () => {
      collections.set({ watchLater: [], favorites: [], history: [video('r1') as Video] });
      mockApi((url, init) => {
        if (url.includes('lighthouse')) return [{ claimId: 'vid1' }, { claimId: 'r1' }, { claimId: 'r2' }];
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.method === 'claim_search') return rpcResult({ items: body.params.claim_ids.map((id: string) => claim(id)) });
        return undefined;
      });
      const { onPlayNext } = setup({ queue: [sample] });
      await settle();
      vi.useFakeTimers();
      end();
      seconds(6);
      expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
    });

    it('falls back to the newest video of the channel when there are no related videos', async () => {
      mockApi((url) => (url.includes('lighthouse') ? [] : undefined));
      const { onPlayNext } = setup();
      await settle();
      vi.useFakeTimers();
      end();
      seconds(6);
      expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'next1' }));
    });

    it('closes after the video when nothing follows', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApi((url) => (url.includes('lighthouse') ? [] : undefined));
      const { onPlayNext, onClose } = setup({ video: { ...sample, channelId: undefined } });
      await settle();
      vi.useFakeTimers();
      end();
      expect(screen.queryByText('Up next')).toBeNull();
      act(() => { vi.advanceTimersByTime(600); });
      expect(onClose).toHaveBeenCalled();
      expect(onPlayNext).not.toHaveBeenCalled();
    });

    it('offers the next video as a button that plays it at once', async () => {
      const queue = [sample, video('q2') as Video];
      const { onPlayNext } = setup({ queue });
      await settle();
      const next = document.querySelector('.player__group .tabler-icon-player-track-next')?.closest('.pbtn') as HTMLElement;
      expect(next).not.toBeNull();
      press(39); press(39);
      expect(next.className).toContain('pbtn--active');
      press(13);
      expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }));
      fireEvent.click(next);
      expect(onPlayNext).toHaveBeenCalledTimes(2);
    });

    it('has no next button while nothing follows, and the remote skips its place', async () => {
      mockApi((url) => (url.includes('lighthouse') ? [] : rpcResult({ items: [claim('vid1')] })));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      setup({ video: { ...sample, channelId: undefined } });
      await settle();
      expect(document.querySelector('.tabler-icon-player-track-next')).toBeNull();
    });

    it('reports the video once when it really starts playing', () => {
      const onStarted = vi.fn();
      setup({ onStarted });
      fireEvent(media(), new Event('canplay'));
      expect(onStarted).not.toHaveBeenCalled();
      fireEvent(media(), new Event('playing'));
      fireEvent(media(), new Event('playing'));
      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ id: 'vid1' }));
    });
  });

  const fail = (message: string | null = 'bad') => {
    Object.defineProperty(media(), 'error', { value: message === null ? null : { message }, configurable: true });
    fireEvent(media(), new Event('error'));
  };

  it('shows the error when the stream cannot be loaded and loads it again on OK', () => {
    setup();
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
    fail();
    expect(screen.getByText('Video playback error: bad')).toBeInTheDocument();
    const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    press(13);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(loads);
    expect(document.querySelector('.player__error')).toBeNull();
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
  });

  const refuse = () => {
    Object.defineProperty(media(), 'error', { value: { code: 4, message: 'MEDIA_ELEMENT_ERROR: Format error' }, configurable: true });
    fireEvent(media(), new Event('error'));
  };
  const loadCalls = () => vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
  const DELAYS = [3, 5, 8, 12, 15, 20, 30, 30, 30, 30];

  it('tries a refused stream again by itself, slowly, behind the loading animation instead of showing an error or a message', () => {
    vi.useFakeTimers();
    setup();
    refuse();
    expect(document.querySelector('.player__error')).toBeNull();
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    expect(document.querySelector('.player__status')).toBeNull();
    const loads = loadCalls();
    act(() => { vi.advanceTimersByTime(2900); });
    expect(loadCalls()).toBe(loads);
    act(() => { vi.advanceTimersByTime(200); });
    expect(loadCalls()).toBeGreaterThan(loads);
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    fireEvent(media(), new Event('playing'));
    expect(document.querySelector('.player__buffering')).toBeNull();
  });

  it('waits a little longer each time, and names both possible causes once it has given up', () => {
    vi.useFakeTimers();
    setup({ video: { ...sample, id: 'patient' } as Video });
    for (const seconds of DELAYS) {
      refuse();
      expect(document.querySelector('.player__error')).toBeNull();
      const before = loadCalls();
      act(() => { vi.advanceTimersByTime(seconds * 1000 - 100); });
      expect(loadCalls()).toBe(before);
      act(() => { vi.advanceTimersByTime(200); });
      expect(loadCalls()).toBeGreaterThan(before);
    }
    refuse();
    expect(screen.getByText('The video could not be loaded. The server may be busy, or this TV cannot play this file. Try again, or pick another video.')).toBeInTheDocument();
    expect(document.querySelector('.player__buffering')).toBeNull();
    const loads = loadCalls();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(loadCalls()).toBe(loads);
  });

  it('lets OK ask again after a short pause, and starts the waiting over', () => {
    vi.useFakeTimers();
    setup({ video: { ...sample, id: 'asking' } as Video });
    for (const seconds of DELAYS) { refuse(); act(() => { vi.advanceTimersByTime(seconds * 1000 + 100); }); }
    refuse();
    expect(document.querySelector('.player__error')).not.toBeNull();
    const loads = loadCalls();
    press(13);
    expect(document.querySelector('.player__toast')?.textContent).toMatch(/^Please wait [1-5] s before trying again$/);
    expect(loadCalls()).toBe(loads);
    act(() => { vi.advanceTimersByTime(5100); });
    press(13);
    expect(loadCalls()).toBeGreaterThan(loads);
    expect(document.querySelector('.player__error')).toBeNull();
    refuse();
    expect(document.querySelector('.player__error')).toBeNull();
    expect(document.querySelector('.player__buffering')).not.toBeNull();
  });

  it('does not repeat the whole waiting for a video that already used it up in this session', () => {
    vi.useFakeTimers();
    const first = setup({ video: { ...sample, id: 'stubborn' } as Video });
    for (const seconds of DELAYS) { refuse(); act(() => { vi.advanceTimersByTime(seconds * 1000 + 100); }); }
    refuse();
    expect(screen.getByText('The video could not be loaded. The server may be busy, or this TV cannot play this file. Try again, or pick another video.')).toBeInTheDocument();
    first.unmount();
    setup({ video: { ...sample, id: 'stubborn' } as Video });
    refuse();
    expect(document.querySelector('.player__error')).toBeNull();
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(30100); });
    refuse();
    expect(screen.getByText('The video could not be loaded. The server may be busy, or this TV cannot play this file. Try again, or pick another video.')).toBeInTheDocument();
  });

  it('ignores OK while it waits to try again, and closes with Back', () => {
    vi.useFakeTimers();
    const { onClose, unmount } = setup();
    refuse();
    const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    const loads = loadCalls();
    press(13);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(plays);
    expect(loadCalls()).toBe(loads);
    press(461);
    press(461);
    expect(onClose).toHaveBeenCalled();
    unmount();
    const closed = loadCalls();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(loadCalls()).toBe(closed);
  });

  describe('mouse clicks on the picture', () => {
    const click = (element: Element) => { fireEvent.mouseDown(element); fireEvent.mouseUp(element); fireEvent.click(element); };
    const pauses = () => vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;
    const plays = () => vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;

    it('pause a playing video and play it again with the next click, like the play button', () => {
      setup();
      setMedia(media(), { currentTime: 30, duration: 600, paused: false });
      fireEvent(media(), new Event('playing'));
      const before = pauses();
      click(media());
      expect(pauses()).toBe(before + 1);
      setMedia(media(), { paused: true });
      fireEvent(media(), new Event('pause'));
      const started = plays();
      click(media());
      expect(plays()).toBe(started + 1);
    });

    it('also count on the empty part of the controls, which cover the picture while they are shown', () => {
      setup();
      setMedia(media(), { paused: false });
      const before = pauses();
      click(document.querySelector('.player__controls') as HTMLElement);
      click(document.querySelector('.player__top') as HTMLElement);
      expect(pauses()).toBe(before + 2);
    });

    it('leave the buttons and the timeline to themselves', () => {
      setup();
      setMedia(media(), { paused: false });
      const before = pauses();
      click(document.querySelector('.player__group--left .pbtn:nth-child(2)') as HTMLElement);
      click(document.querySelector('.timeline__time') as HTMLElement);
      expect(pauses()).toBe(before);
    });

    it('do nothing when a drag on the timeline is let go over the picture, and work again after it', () => {
      setup();
      setMedia(media(), { paused: false });
      const before = pauses();
      fireEvent.mouseDown(document.querySelector('.timeline__track') as HTMLElement);
      fireEvent.mouseUp(media());
      fireEvent.click(media());
      expect(pauses()).toBe(before);
      click(media());
      expect(pauses()).toBe(before + 1);
    });

    it('only close the menu when they are outside it', () => {
      setup();
      setMedia(media(), { paused: false });
      openMenu();
      const before = pauses();
      click(document.querySelector('.picker') as HTMLElement);
      expect(document.querySelector('.picker')).toBeNull();
      expect(pauses()).toBe(before);
    });

    it('ask again when an error is shown, like OK', () => {
      setup();
      fail();
      expect(document.querySelector('.player__error')).not.toBeNull();
      click(document.querySelector('.player__error') as HTMLElement);
      expect(document.querySelector('.player__error')).toBeNull();
    });

    it('are ignored while it waits to try again', () => {
      vi.useFakeTimers();
      setup();
      refuse();
      const loads = loadCalls();
      const before = pauses();
      const started = plays();
      click(media());
      expect(loadCalls()).toBe(loads);
      expect(pauses()).toBe(before);
      expect(plays()).toBe(started);
    });

    it('are ignored while the countdown to the next video runs', async () => {
      const queue = [sample, video('q2') as Video];
      setup({ queue });
      await settle();
      vi.useFakeTimers();
      end();
      expect(screen.getByText('Up next')).toBeInTheDocument();
      setMedia(media(), { paused: false });
      const before = pauses();
      click(media());
      expect(pauses()).toBe(before);
      expect(screen.getByText('Up next')).toBeInTheDocument();
    });
  });

  it('shows what the player says when a file cannot be played at all, instead of saying the server is busy', () => {
    setup();
    Object.defineProperty(media(), 'error', { value: { code: 4, message: 'DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(screen.getByText('Video playback error: DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed')).toBeInTheDocument();
    const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    press(13);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(loads);
  });

  it('does not say busy for a stream that played before and broke later', () => {
    vi.useFakeTimers();
    setup();
    setMedia(media(), { currentTime: 30, duration: 600, paused: false });
    fireEvent(media(), new Event('playing'));
    Object.defineProperty(media(), 'error', { value: { code: 4, message: 'gone' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(document.querySelector('.player__error')).toBeNull();
  });

  describe('transcoded stream', () => {
    const START = (id: string) => `https://player.odycdn.com/v6/streams/${id}/sd1/v0.m3u8`;
    const FILE = (id: string) => `https://odysee.com/$/download/name-${id}/${id}`;
    const playlist = (status = 200, type = 'application/x-mpegurl') => new Response(status === 200 ? MASTER_TEXT : null, { status, headers: { 'Content-Type': type } });
    const withHls = (id: string) => ({ ...sample, id, claimName: `name-${id}`, sdHash: 'sd1' }) as Video;
    const answer = (handler: () => Response) => mockApi((url) => (url.includes('player.odycdn.com') ? handler() : undefined));
    const lookups = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.filter(([url]) => String(url).includes('player.odycdn.com'));
    const nativeHls = () => vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) => (/mpegurl/i.test(type) ? 'maybe' : ''));
    const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const later = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    it('starts the transcoded stream on its best rendition when the TV can play HLS and the server has one', async () => {
      nativeHls();
      const spy = answer(() => playlist());
      setup({ video: withHls('hls1') });
      await waitFor(() => expect(media().src).toBe(START('hls1')));
      expect(lookups(spy)).toHaveLength(1);
      expect(lookups(spy)[0][0]).toBe('https://player.odycdn.com/v6/streams/hls1/sd1/master.m3u8');
      fireEvent(media(), new Event('playing'));
      expect(document.querySelector('.player__error')).toBeNull();
    });

    it('plays the file when the server has no transcoded copy', async () => {
      nativeHls();
      answer(() => playlist(404, 'text/plain'));
      setup({ video: withHls('hls2') });
      await waitFor(() => expect(media().src).toBe(FILE('hls2')));
    });

    it('does not look for a transcoded stream when the browser cannot play HLS', () => {
      const spy = answer(() => playlist());
      setup({ video: withHls('hls3') });
      expect(media().src).toBe(FILE('hls3'));
      expect(lookups(spy)).toHaveLength(0);
    });

    it('plays the file at once when the server refuses the lookup, since the origin still serves the file', async () => {
      nativeHls();
      const spy = answer(() => playlist(429, 'text/plain'));
      setup({ video: withHls('hls4') });
      await waitFor(() => expect(media().src).toBe(FILE('hls4')));
      expect(lookups(spy)).toHaveLength(1);
      expect(document.querySelector('.player__error')).toBeNull();
    });

    it('asks for the file at once when the transcoded stream does not start', async () => {
      vi.useFakeTimers();
      nativeHls();
      const spy = answer(() => playlist());
      setup({ video: withHls('hls6') });
      await settle();
      expect(media().src).toBe(START('hls6'));
      refuse();
      await settle();
      expect(media().src).toBe(FILE('hls6'));
      expect(document.querySelector('.player__error')).toBeNull();
      expect(lookups(spy)).toHaveLength(1);
    });

    it('does not try the transcoded stream again in this session for a video where it failed, except when OK asks again', async () => {
      vi.useFakeTimers();
      nativeHls();
      const spy = answer(() => playlist());
      const first = setup({ video: withHls('hls7') });
      await settle();
      refuse();
      await settle();
      expect(media().src).toBe(FILE('hls7'));
      expect(lookups(spy)).toHaveLength(1);
      first.unmount();
      setup({ video: withHls('hls7') });
      expect(media().src).toBe(FILE('hls7'));
      expect(lookups(spy)).toHaveLength(1);
      fail();
      expect(document.querySelector('.player__error')).not.toBeNull();
      press(13);
      await settle();
      expect(lookups(spy)).toHaveLength(2);
      expect(media().src).toBe(START('hls7'));
    });

    it('shows the error right away when the browser refuses to start the video, which is not a problem of the stream', async () => {
      nativeHls();
      const spy = answer(() => playlist());
      vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(Object.assign(new Error('needs a click'), { name: 'NotAllowedError' }));
      setup({ video: withHls('hls9') });
      await waitFor(() => expect(screen.getByText('Failed to play video: needs a click')).toBeInTheDocument());
      expect(lookups(spy)).toHaveLength(1);
    });

    it('reloads a transcoded stream that breaks after it played through the file, which the origin serves more reliably', async () => {
      vi.useFakeTimers();
      nativeHls();
      const spy = answer(() => playlist());
      setup({ video: withHls('hls8') });
      await settle();
      expect(media().src).toBe(START('hls8'));
      setMedia(media(), { currentTime: 30, duration: 600, paused: false });
      fireEvent(media(), new Event('playing'));
      Object.defineProperty(media(), 'error', { value: { code: 2, message: 'network' }, configurable: true });
      fireEvent(media(), new Event('error'));
      expect(document.querySelector('.player__error')).toBeNull();
      await later(2100);
      expect(media().src).toBe(FILE('hls8'));
      expect(lookups(spy)).toHaveLength(1);
    });
  });

  describe('hls.js in the dev server', () => {
    const MASTER = (id: string) => `https://player.odycdn.com/v6/streams/${id}/sd1/master.m3u8`;
    const FILE = (id: string) => `https://odysee.com/$/download/name-${id}/${id}`;
    const withHls = (id: string) => ({ ...sample, id, claimName: `name-${id}`, sdHash: 'sd1' }) as Video;
    const answer = () => mockApi((url) => (url.includes('player.odycdn.com') ? new Response(MASTER_TEXT, { headers: { 'Content-Type': 'application/x-mpegurl' } }) : undefined));

    it('plays the transcoded stream through hls.js when the browser has no HLS of its own', async () => {
      vi.stubGlobal('DEV_SERVER', true);
      answer();
      setup({ video: withHls('js1') });
      await waitFor(() => expect(hlsJs.created).toHaveLength(1));
      expect(hlsJs.created[0].url).toBe(MASTER('js1'));
      expect(hlsJs.created[0].media).toBe(media());
      expect(media().hasAttribute('src')).toBe(false);
      expect(vi.mocked(HTMLMediaElement.prototype.play)).toHaveBeenCalled();
    });

    it('asks for the file at once when hls.js reports a fatal problem before the video starts', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('DEV_SERVER', true);
      answer();
      setup({ video: withHls('js2') });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(hlsJs.created).toHaveLength(1);
      act(() => hlsJs.created[0].fire({ fatal: true, details: 'manifestLoadError' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(hlsJs.created[0].destroyed).toBe(true);
      expect(hlsJs.created).toHaveLength(1);
      expect(media().src).toBe(FILE('js2'));
    });

    it('goes on after a problem that hls.js recovers from by itself', async () => {
      vi.stubGlobal('DEV_SERVER', true);
      answer();
      setup({ video: withHls('js3') });
      await waitFor(() => expect(hlsJs.created).toHaveLength(1));
      act(() => hlsJs.created[0].fire({ fatal: false, details: 'fragLoadError' }));
      expect(media().hasAttribute('src')).toBe(false);
      expect(hlsJs.created[0].destroyed).toBe(false);
    });

    it('asks for the file when this browser cannot run hls.js', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('DEV_SERVER', true);
      hlsJs.state.supported = false;
      answer();
      setup({ video: withHls('js4') });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(media().src).toBe(FILE('js4'));
      expect(hlsJs.created).toHaveLength(0);
    });

    it('lets go of hls.js when the player closes', async () => {
      vi.stubGlobal('DEV_SERVER', true);
      answer();
      const open = setup({ video: withHls('js5') });
      await waitFor(() => expect(hlsJs.created).toHaveLength(1));
      await act(async () => { await flush(); });
      open.unmount();
      expect(hlsJs.created[0].destroyed).toBe(true);
    });

    it('lets go of hls.js when the player closes before it finished starting up', async () => {
      vi.stubGlobal('DEV_SERVER', true);
      answer();
      const open = setup({ video: withHls('js6') });
      hlsJs.state.beforeUse = () => open.unmount();
      await waitFor(() => expect(hlsJs.created).toHaveLength(1));
      await act(async () => { await flush(); });
      expect(hlsJs.created[0].destroyed).toBe(true);
    });
  });

  it('says that the device cannot play a file when the engine names no reason for a decode problem', () => {
    setup();
    Object.defineProperty(media(), 'error', { value: { code: 3, message: '' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(screen.getByText('This device cannot play this video file.')).toBeInTheDocument();
  });

  it('keeps the old text for a nameless problem that says nothing about the file', () => {
    setup();
    Object.defineProperty(media(), 'error', { value: { code: 2, message: '' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(screen.getByText('Video playback error: Unknown error')).toBeInTheDocument();
  });

  it('treats a nameless refusal like a busy server, since other browsers give no message for a 429', () => {
    vi.useFakeTimers();
    setup();
    Object.defineProperty(media(), 'error', { value: { code: 4, message: '' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    expect(document.querySelector('.player__error')).toBeNull();
  });

  it('counts a failure only once when play() and the error event report it together', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('no source'));
    setup();
    fail();
    await act(async () => { await flush(); });
    expect(screen.getAllByText(/Video playback error|Failed to play video/)).toHaveLength(1);
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
  });

  it('shows an error when playback cannot start on any source', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('blocked'));
    setup();
    expect(await screen.findByText('Failed to play video: blocked')).toBeInTheDocument();
    vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue(undefined);
  });

  it('ignores the abort that comes from switching the stream', async () => {
    const abort = Object.assign(new Error('interrupted'), { name: 'AbortError' });
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(abort);
    setup();
    await act(async () => { await flush(); });
    expect(document.querySelector('.player__error')).toBeNull();
    expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
  });

  it('describes unknown playback errors', () => {
    setup();
    fail(null);
    expect(screen.getByText('Video playback error: Unknown error')).toBeInTheDocument();
  });

  it('asks for the stream again where it stopped when it breaks after playing, because a signed link expires', () => {
    vi.useFakeTimers();
    try {
      setup();
      setMedia(media(), { currentTime: 300, duration: 3600, paused: false });
      fireEvent(media(), new Event('playing'));
      const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
      fail();
      expect(document.querySelector('.player__error')).toBeNull();
      act(() => { vi.advanceTimersByTime(1900); });
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBe(loads);
      act(() => { vi.advanceTimersByTime(200); });
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(loads);
      expect(media().src).toBe('https://odysee.com/$/download/name-vid1/vid1');
      setMedia(media(), { currentTime: 0, duration: 3600 });
      fireEvent(media(), new Event('loadedmetadata'));
      expect(media().currentTime).toBe(300);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after a few reloads in a row but starts counting again once it plays', () => {
    vi.useFakeTimers();
    try {
      setup();
      setMedia(media(), { paused: false });
      fireEvent(media(), new Event('playing'));
      for (let round = 0; round < 3; round++) {
        fail();
        act(() => { vi.advanceTimersByTime(2100); });
        fireEvent(media(), new Event('playing'));
      }
      expect(document.querySelector('.player__error')).toBeNull();
      for (let round = 0; round < 3; round++) {
        fail();
        act(() => { vi.advanceTimersByTime(5100); });
      }
      fail();
      expect(screen.getByText('Video playback error: bad')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('when the user pauses', () => {
    const playing = (currentTime = 300) => {
      setup();
      setMedia(media(), { currentTime, duration: 3600, paused: false });
      fireEvent(media(), new Event('playing'));
    };
    const paused = (keyCode: number) => {
      press(keyCode);
      setMedia(media(), { paused: true });
      fireEvent(media(), new Event('pause'));
    };
    const calls = (method: 'load' | 'play' | 'pause') => vi.mocked(HTMLMediaElement.prototype[method]).mock.calls.length;

    it('leaves a stream that broke meanwhile alone and loads it again from OK, where it stopped', () => {
      vi.useFakeTimers();
      try {
        playing();
        paused(19);
        const [loads, plays] = [calls('load'), calls('play')];
        fail();
        act(() => { vi.advanceTimersByTime(10000); });
        expect(calls('load')).toBe(loads);
        expect(calls('play')).toBe(plays);
        expect(document.querySelector('.player__error')).toBeNull();
        press(13);
        expect(calls('load')).toBeGreaterThan(loads);
        expect(calls('play')).toBeGreaterThan(plays);
        setMedia(media(), { currentTime: 0 });
        fireEvent(media(), new Event('loadedmetadata'));
        expect(media().currentTime).toBe(300);
      } finally {
        vi.useRealTimers();
      }
    });

    it('also loads the broken stream again from the play key, and counts the reloads from the start', () => {
      vi.useFakeTimers();
      try {
        playing();
        for (let round = 0; round < 5; round++) {
          paused(10252);
          const loads = calls('load');
          fail();
          act(() => { vi.advanceTimersByTime(5000); });
          expect(calls('load')).toBe(loads);
          press(415);
          expect(calls('load')).toBeGreaterThan(loads);
          setMedia(media(), { paused: false });
          fireEvent(media(), new Event('playing'));
        }
        expect(document.querySelector('.player__error')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('still loads a stream again by itself when it broke while it was playing', () => {
      vi.useFakeTimers();
      try {
        playing();
        const loads = calls('load');
        fail();
        act(() => { vi.advanceTimersByTime(2100); });
        expect(calls('load')).toBeGreaterThan(loads);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pauses again when the TV or the stream starts it by itself, and plays when the user asks', () => {
      playing();
      paused(19);
      setMedia(media(), { paused: false });
      const pauses = calls('pause');
      fireEvent(media(), new Event('play'));
      expect(calls('pause')).toBe(pauses + 1);
      expect(document.querySelector('.pbtn--play svg.tabler-icon-player-play')).not.toBeNull();
      setMedia(media(), { paused: true });
      press(415);
      setMedia(media(), { paused: false });
      fireEvent(media(), new Event('play'));
      expect(calls('pause')).toBe(pauses + 1);
      expect(document.querySelector('.pbtn--play svg.tabler-icon-player-pause')).not.toBeNull();
    });

    it('plays again when another quality or a retry loads the stream anew', () => {
      playing();
      paused(19);
      press(13);
      setMedia(media(), { paused: false });
      const pauses = calls('pause');
      fireEvent(media(), new Event('play'));
      expect(calls('pause')).toBe(pauses);
    });
  });

  it('shows the buffering state while waiting', () => {
    setup();
    fireEvent(media(), new Event('canplay'));
    expect(document.querySelector('.player__buffering')).toBeNull();
    fireEvent(media(), new Event('waiting'));
    expect(document.querySelector('.player__buffering')).not.toBeNull();
  });
});

describe('Player buffering indicator', () => {
  it('stays in the middle of the screen', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../app/styles/styles.css'), 'utf8');
    const rules = cssRules(css, '.player__buffering');
    expect(rules).toHaveLength(1);
    expect(rules[0].position).toBe('absolute');
    expect(rules[0].top).toBe('50%');
    expect(rules[0].left).toBe('50%');
    expect(rules[0].transform).toBe('translate(-50%, -50%)');
  });
});

describe('Player remote control', () => {
  it('does not toggle playback again for the repeats of a held OK', () => {
    setup();
    const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    setMedia(media(), { paused: true });
    fireEvent.keyDown(window, { keyCode: 13 });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(plays + 1);
  });


  it('hides the controls first and closes on the second back press', () => {
    const { onClose } = setup();
    expect(document.querySelector('.player__controls--visible')).not.toBeNull();
    press(461);
    expect(document.querySelector('.player__controls--visible')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    press(461);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with the stop key and the top bar button', () => {
    const { onClose } = setup();
    press(413);
    expect(onClose).toHaveBeenCalledTimes(1);
    press(38); press(38);
    press(13);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector('.player__top .pbtn') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('can leave out the back arrow, and the Back key and the stop key still close the player', () => {
    setSetting('osdBackButton', false);
    const { onClose } = setup();
    expect(document.querySelector('.player__top .pbtn')).toBeNull();
    expect(document.querySelector('.player__title')?.className).toContain('player__title--first');
    press(38); press(38); press(38);
    expect(document.querySelector('.pbtn--active')).toBeNull();
    press(13);
    expect(onClose).not.toHaveBeenCalled();
    press(413);
    expect(onClose).toHaveBeenCalledTimes(1);
    press(461);
    press(461);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows the back arrow by default and moves the title next to it', () => {
    setup();
    expect(document.querySelector('.player__top .pbtn')).not.toBeNull();
    expect(document.querySelector('.player__title')?.className).not.toContain('player__title--first');
  });

  it('toggles playback with OK, the play keys and clicks', () => {
    setup();
    setMedia(media(), { paused: true });
    press(13);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    setMedia(media(), { paused: false });
    press(10252);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    press(415);
    press(19);
    press(179);
    fireEvent.click(document.querySelector('.pbtn--play') as HTMLElement);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(4);
  });

  it('seeks with left and right when the controls are hidden, with growing steps', () => {
    setup();
    setMedia(media(), { currentTime: 100, duration: 600 });
    press(461);
    press(39);
    expect(media().currentTime).toBe(110);
    press(39);
    expect(media().currentTime).toBe(120);
    press(39);
    expect(media().currentTime).toBe(140);
    press(37);
    expect(media().currentTime).toBe(130);
    press(412);
    press(417);
  });

  it('keeps seeking inside the video bounds', () => {
    setup();
    setMedia(media(), { currentTime: 3, duration: 600 });
    press(461);
    press(37);
    expect(media().currentTime).toBe(0);
    setMedia(media(), { currentTime: 595, duration: 600 });
    press(39);
    expect(media().currentTime).toBe(600);
    setMedia(media(), { currentTime: 10, duration: Number.NaN });
    press(39);
    expect(media().currentTime).toBeGreaterThan(10);
  });

  it('moves between buttons and seeks from the progress row', () => {
    setup();
    setMedia(media(), { currentTime: 100, duration: 600 });
    press(37);
    press(37);
    press(39);
    press(38);
    press(39);
    expect(media().currentTime).toBe(110);
    press(37);
    expect(media().currentTime).toBe(100);
    press(40);
    press(13);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('stops at both ends of the button row', () => {
    setup();
    for (let index = 0; index < 12; index++) press(39);
    for (let index = 0; index < 12; index++) press(37);
    press(40);
    press(38);
    press(40);
  });

  it('ignores other keys', () => {
    setup();
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('seeks to the clicked position on the timeline', () => {
    setup();
    setMedia(media(), { duration: 600, currentTime: 0 });
    const track = document.querySelector('.timeline__track') as HTMLElement;
    track.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseDown(track, { clientX: 100 });
    fireEvent.mouseUp(window, { clientX: 100 });
    expect(media().currentTime).toBe(300);
  });
});

describe('Player actions', () => {
  it('toggles favorites and watch later', () => {
    setup();
    press(37); press(37);
    press(13);
    expect(collections.get().watchLater.map((entry) => entry.id)).toEqual(['vid1']);
    press(13);
    expect(collections.get().watchLater).toEqual([]);
    press(37);
    press(13);
    expect(collections.get().favorites.map((entry) => entry.id)).toEqual(['vid1']);
  });

  it('opens the channel', () => {
    const { onClose, onOpenChannel } = setup();
    fireEvent.click(document.querySelector('.pbtn--avatar') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
    expect(onOpenChannel).toHaveBeenCalledWith('chan', 'Channel');
  });

  it('does not open a channel when the video has none', () => {
    const { onOpenChannel } = setup({ video: { ...sample, channelId: undefined } });
    fireEvent.click(document.querySelector('.pbtn--avatar') as HTMLElement);
    expect(onOpenChannel).not.toHaveBeenCalled();
  });

  it('ignores account actions for guests', () => {
    setup();
    Array.from(document.querySelectorAll('.player__group--right .pbtn')).slice(0, 2).forEach((button) => fireEvent.click(button));
    expect(document.querySelector('.pbtn--on')).toBeNull();
  });

  it('focuses the button under the cursor, and the back arrow', () => {
    const { onClose } = setup();
    const buttons = () => Array.from(document.querySelectorAll('.player__group--left .pbtn, .player__group .pbtn, .player__group--right .pbtn'));
    const stars = document.querySelector('.player__group--left .tabler-icon-star')?.closest('.pbtn') as HTMLElement;
    hoverOver(stars);
    expect(document.querySelector('.pbtn--active')).toBe(stars);
    const play = document.querySelector('.pbtn--play') as HTMLElement;
    hoverOver(play);
    expect(document.querySelector('.pbtn--active')).toBe(play);
    expect(buttons().length).toBeGreaterThan(5);
    press(13);
    expect(document.querySelector('.pbtn--play svg.tabler-icon-player-play')).not.toBeNull();
    hoverOver(document.querySelector('.player__top .pbtn') as HTMLElement);
    expect(document.querySelector('.player__top .pbtn--active')).not.toBeNull();
    press(13);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no follow button for guests, and the remote skips its place', () => {
    setup();
    expect(document.querySelectorAll('.player__group--left .pbtn')).toHaveLength(3);
    expect(document.querySelector('.player__group--left .tabler-icon-heart')).toBeNull();
    [37, 37, 37].forEach(press);
    expect(document.querySelectorAll('.player__group--left .pbtn')[1].className).toContain('pbtn--active');
    press(37);
    expect(document.querySelectorAll('.player__group--left .pbtn')[0].className).toContain('pbtn--active');
    press(37);
    expect(document.querySelectorAll('.player__group--left .pbtn')[0].className).toContain('pbtn--active');
  });

  it('has the follow button for a signed in user, and the remote stops at it', () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    setup();
    expect(document.querySelectorAll('.player__group--left .pbtn')).toHaveLength(4);
    [37, 37, 37, 37].forEach(press);
    expect(document.querySelectorAll('.player__group--left .pbtn')[1].className).toContain('pbtn--active');
  });

  it('has no follow button for a video without a channel, even when signed in', () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    setup({ video: { ...sample, channelId: '' } });
    expect(document.querySelectorAll('.player__group--left .pbtn')).toHaveLength(3);
  });

  it('likes, unlikes, dislikes and follows when signed in', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    const prefs = { following: [] as { uri: string }[] };
    mockApi((url, init) => {
      if (url.includes('/reaction/list')) return { success: true, data: { reactions: { vid1: { like: 5, dislike: 2 } }, my_reactions: { vid1: 'like' } } };
      const body = bodyOf(init);
      if (body.method === 'preference_get') return rpcResult({ shared: { value: prefs } });
      if (body.method === 'preference_set') { prefs.following = JSON.parse(body.params.value).value.following; return rpcResult({}); }
      return undefined;
    });
    setup();
    expect(await screen.findByText('5 likes')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.player__group--right .pbtn--on')).not.toBeNull());

    const [like, dislike] = Array.from(document.querySelectorAll('.player__group--right .pbtn')) as HTMLElement[];
    fireEvent.click(like);
    await waitFor(() => expect(screen.getByText('4 likes')).toBeInTheDocument());
    fireEvent.click(dislike);
    await waitFor(() => expect(dislike.className).toContain('pbtn--slime'));
    expect(screen.getByText('4 likes')).toBeInTheDocument();
    fireEvent.click(like);
    await waitFor(() => expect(like.className).toContain('pbtn--on'));
    fireEvent.click(like);
    await waitFor(() => expect(like.className).not.toContain('pbtn--on'));

    const follow = document.querySelectorAll('.player__group--left .pbtn')[1] as HTMLElement;
    fireEvent.click(follow);
    await waitFor(() => expect(follow.className).toContain('pbtn--on'));
    expect(prefs.following).toHaveLength(1);
    fireEvent.click(follow);
    await waitFor(() => expect(follow.className).not.toContain('pbtn--on'));
  });

  it('shows the follow state of followed channels', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    mockApi((_url, init) => {
      const body = bodyOf(init);
      if (body.method === 'preference_get') return rpcResult({ shared: { value: { following: [{ uri: 'lbry://@chan#chan' }] } } });
      return undefined;
    });
    setup();
    await waitFor(() => expect(document.querySelectorAll('.player__group--left .pbtn')[1].className).toContain('pbtn--on'));
  });

  it('survives reaction failures and videos without a channel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => { throw new Error('offline'); });
    setup({ video: { ...sample, channelId: undefined } });
    await act(async () => { await flush(); });
    expect(document.querySelector('.player')).not.toBeNull();
  });
});

function setSize(element: HTMLVideoElement, width: number, height: number) {
  Object.defineProperty(element, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'videoHeight', { value: height, configurable: true });
  fireEvent(element, new Event('loadedmetadata'));
}

const openMenu = () => { fireEvent.click(document.querySelector('.player__group--right .pbtn:last-child') as HTMLElement); };
const menuEntries = () => Array.from(document.querySelectorAll('.picker .pickerItem')).map((item) => item.textContent);

describe('Player settings menu', () => {
  it('has one gear button on the right instead of separate buttons', () => {
    setup();
    const buttons = document.querySelectorAll('.player__group--right .pbtn');
    expect(buttons).toHaveLength(3);
    expect(buttons[2].querySelector('svg')).not.toBeNull();
    expect(document.querySelector('.pbtn--pill')).toBeNull();
  });

  it('lists aspect ratio and speed with their current values', () => {
    setSetting('aspectRatio', 'zoom');
    setSetting('playbackSpeed', 1.5);
    setup();
    openMenu();
    expect(screen.getByText('Settings', { selector: 'h2' })).toBeInTheDocument();
    expect(menuEntries()).toEqual(['Aspect RatioZoom', 'Playback Speed1.5\u00d7']);
  });

  it('starts with the defaults from Settings', () => {
    setSetting('aspectRatio', 'zoom');
    setSetting('playbackSpeed', 1.5);
    setup();
    expect(media().style.objectFit).toBe('cover');
    expect(media().playbackRate).toBe(1.5);
  });

  it('falls back to auto for an unknown stored aspect ratio and names unusual speeds', () => {
    setSetting('aspectRatio', 'mystery');
    setSetting('playbackSpeed', 3);
    setup();
    expect(media().style.objectFit).toBe('contain');
    fireEvent.click(document.querySelector('.player__group--right .pbtn:last-child') as HTMLElement);
    expect(menuEntries()).toContain('Playback Speed3\u00d7');
  });

  it('changes the speed and shows what happened', () => {
    vi.useFakeTimers();
    setup();
    openMenu();
    press(40);
    press(13);
    expect(screen.getByText('Playback Speed', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(13);
    expect(document.querySelector('.picker')).toBeNull();
    expect(media().playbackRate).toBe(1.25);
    expect(document.querySelector('.player__toast')?.textContent).toBe('Speed: 1.25\u00d7');
    act(() => { vi.advanceTimersByTime(3100); });
    expect(document.querySelector('.player__toast')).toBeNull();
  });

  it('changes the aspect ratio', () => {
    setup();
    openMenu();
    press(13);
    expect(screen.getByText('Aspect Ratio', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(13);
    expect(media().style.objectFit).toBe('cover');
    expect(document.querySelector('.player__toast')?.textContent).toBe('Aspect ratio: Zoom');
    openMenu();
    expect(menuEntries()[0]).toBe('Aspect RatioZoom');
  });

  it('goes back from a choice to the menu and closes the menu without touching playback', () => {
    const { onClose } = setup();
    openMenu();
    press(13);
    press(461);
    expect(screen.getByText('Settings', { selector: 'h2' })).toBeInTheDocument();
    expect(media().style.objectFit).toBe('contain');
    press(461);
    expect(document.querySelector('.picker')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.player__controls--visible')).not.toBeNull();
    openMenu();
    press(38);
    press(413);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens with a click and remembers the last entry', () => {
    setup();
    fireEvent.click(document.querySelector('.player__group--right .pbtn:last-child') as HTMLElement);
    press(40);
    press(13);
    press(461);
    expect(document.querySelector('.pickerItem--active')?.textContent).toContain('Playback Speed');
  });

  it('opens as a popover next to the picture, and the controls stay while it is open', () => {
    vi.useFakeTimers();
    setup();
    fireEvent(media(), new Event('play'));
    openMenu();
    expect(document.querySelector('.picker')).toHaveClass('picker--popover');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(document.querySelector('.player__controls--visible')).not.toBeNull();
    press(461);
    expect(document.querySelector('.picker')).toBeNull();
    expect(document.querySelector('.player__controls--visible')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(4100); });
    expect(document.querySelector('.player__controls--visible')).toBeNull();
  });

  it('shows the aspect ratio and the speed while they are picked, before OK, and puts them back on Back', () => {
    setup();
    openMenu();
    press(13);
    press(40);
    expect(media().style.objectFit).toBe('cover');
    expect(document.querySelector('.player__toast')).toBeNull();
    press(461);
    expect(media().style.objectFit).toBe('contain');
    expect(menuEntries()[0]).toBe('Aspect RatioAuto');
    press(40);
    press(13);
    press(40);
    expect(media().playbackRate).toBe(1.25);
    press(40);
    expect(media().playbackRate).toBe(1.5);
    press(461);
    expect(media().playbackRate).toBe(1);
    expect(menuEntries()[1]).toBe('Playback Speed1\u00d7');
  });

  it('keeps what OK picked and closes the popover', () => {
    setup();
    openMenu();
    press(13);
    press(40);
    press(13);
    expect(document.querySelector('.picker')).toBeNull();
    expect(media().style.objectFit).toBe('cover');
    openMenu();
    expect(menuEntries()[0]).toBe('Aspect RatioZoom');
    press(13);
    press(38);
    press(461);
    expect(media().style.objectFit).toBe('cover');
  });

  it('closes with a click next to the popover and puts back what was only being tried', () => {
    setup();
    openMenu();
    press(13);
    press(40);
    expect(media().style.objectFit).toBe('cover');
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(document.querySelector('.picker')).toBeNull();
    expect(media().style.objectFit).toBe('contain');
    openMenu();
    fireEvent.click(document.querySelector('.picker__panel') as HTMLElement);
    expect(document.querySelector('.picker')).not.toBeNull();
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(document.querySelector('.picker')).toBeNull();
  });
});

describe('Player settings popover styles', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../app/styles/styles.css'), 'utf8');

  it('draws no dimming layer, which only the centered pickers keep', () => {
    const popover = cssRules(css, '.picker--popover');
    expect(popover).toHaveLength(1);
    expect(popover[0].background).toBe('none');
    expect(popover[0]['align-items']).toBe('flex-end');
    expect(popover[0]['justify-content']).toBe('flex-end');
    expect(cssRules(css, '.picker')[0].background).toBe('rgba(0, 0, 0, 0.7)');
  });

  it('is a compact dark panel whatever the theme, with the accent on the entry in use', () => {
    const panel = cssRules(css, '.picker--popover .picker__panel');
    expect(panel).toHaveLength(1);
    expect(panel[0].width).toBe('560px');
    expect(panel[0].color).toBe('#fff');
    expect(panel[0].background).toMatch(/^rgba\(0, 0, 0, 0\.\d+\)$/);
    expect(cssRules(css, '.picker--popover .pickerItem')[0].background).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
    expect(cssRules(css, '.picker--popover .pickerItem--active')[0].background).toBe('var(--accent)');
  });
});

describe('Player Stats for Nerds', () => {
  const statsEntry = () => menuEntries().find((entry) => entry?.startsWith('Stats for Nerds'));

  it('is not offered until it is switched on in Settings', () => {
    setup();
    openMenu();
    expect(statsEntry()).toBeUndefined();
    expect(document.querySelector('.playerStats')).toBeNull();
  });

  it('shows the details of the playback and hides them again', () => {
    vi.useFakeTimers();
    setSetting('statsForNerds', true);
    setup();
    setMedia(media(), { currentTime: 30, duration: 600, paused: false });
    openMenu();
    expect(statsEntry()).toBe('Stats for NerdsOff');
    press(40); press(40);
    press(13);
    expect(document.querySelector('.picker')).toBeNull();
    const panel = document.querySelector('.playerStats') as HTMLElement;
    expect(panel).not.toBeNull();
    ['Video', 'Stream', 'Resolution', 'Buffer', 'Position', 'Engine'].forEach((label) => expect(panel.textContent).toContain(label));
    expect(panel.textContent).toContain('vid1');
    act(() => { vi.advanceTimersByTime(2100); });
    openMenu();
    expect(statsEntry()).toBe('Stats for NerdsOn');
    press(40); press(40);
    press(13);
    expect(document.querySelector('.playerStats')).toBeNull();
  });

  it('keeps the panel open for the next video of the session', () => {
    setSetting('statsForNerds', true);
    const first = setup();
    openMenu();
    press(40); press(40);
    press(13);
    first.unmount();
    setup();
    expect(document.querySelector('.playerStats')).not.toBeNull();
    setSetting('statsForNerds', false);
  });

  it('describes the stream that is played', () => {
    setSetting('statsForNerds', true);
    setup({ video: { ...sample, size: 52428800, mediaType: 'video/mp4' } });
    setMedia(media(), { currentTime: 0, duration: 600 });
    openMenu();
    press(40); press(40);
    press(13);
    const text = document.querySelector('.playerStats')?.textContent ?? '';
    expect(text).toContain('original file from odysee.com');
    expect(text).toContain('video/mp4, 50.0 MB');
    expect(text).toContain('about 0.70 Mbit/s');
  });

  it('says when it plays the transcoded stream', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    mockApi((url) => (url.includes('player.odycdn.com') ? new Response(MASTER_TEXT, { headers: { 'Content-Type': 'application/x-mpegurl' } }) : undefined));
    setSetting('statsForNerds', true);
    setup({ video: { ...sample, id: 'stats-hls', claimName: 'name-stats-hls', sdHash: 'sd1', size: 52428800 } as Video });
    await waitFor(() => expect(media().src).toContain('v0.m3u8'));
    setMedia(media(), { currentTime: 0, duration: 600 });
    openMenu();
    press(40); press(40);
    press(13);
    const text = document.querySelector('.playerStats')?.textContent ?? '';
    expect(text).toContain('adaptive stream (HLS) from player.odycdn.com');
    expect(text).toContain('chosen by the player (original file about 0.70 Mbit/s)');
  });
});

describe('Player on webOS', () => {
  type Reply = { returnValue: boolean; errorCode?: number };
  const calls: { uri: string; params: Record<string, unknown> }[] = [];
  let reply: (uri: string) => Reply = () => ({ returnValue: true });

  class FakeBridge {
    onservicecallback: (message: string) => void = () => {};
    call(uri: string, params: string) {
      calls.push({ uri, params: JSON.parse(params) });
      const answer = reply(uri);
      queueMicrotask(() => this.onservicecallback(JSON.stringify(answer)));
    }
    cancel() {}
  }

  beforeEach(() => {
    calls.length = 0;
    reply = () => ({ returnValue: true });
    vi.stubGlobal('PalmServiceBridge', FakeBridge);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/68.0.3440.106 Safari/537.36 WebAppManager');
  });

  const withMedia = () => {
    Object.defineProperty(media(), 'mediaId', { value: 'media-1', configurable: true });
  };
  const settle = async () => { await act(async () => { for (let index = 0; index < 6; index++) await flush(); }); };

  it('speeds up through the media service instead of playbackRate', async () => {
    setSetting('playbackSpeed', 1.5);
    setup();
    withMedia();
    fireEvent(media(), new Event('loadedmetadata'));
    await settle();
    expect(calls.find((call) => call.uri.endsWith('/setPlayRate'))?.params).toEqual({ mediaId: 'media-1', playRate: 1.5, audioOutput: true });
    expect(media().playbackRate).toBe(1);
  });

  it('crops and stretches with the video output service', async () => {
    setSetting('aspectRatio', 'zoom');
    setup();
    withMedia();
    setSize(media(), 640, 480);
    await settle();
    const call = calls.find((entry) => entry.uri.endsWith('/setDisplayWindow'));
    expect(call?.params).toMatchObject({ context: 'media-1', sourcePort: 3, fullScreen: false });
    expect(call?.params.displayOutput).toEqual({ x: 0, y: 0, width: window.screen.width || window.innerWidth, height: window.screen.height || window.innerHeight });
  });

  it('keeps retrying while the TV has not registered the video yet, then gives up on failures', async () => {
    vi.useFakeTimers();
    setSetting('aspectRatio', 'stretch');
    reply = (uri) => (uri.endsWith('/setDisplayWindow') ? { returnValue: false, errorCode: 53 } : { returnValue: false });
    setup();
    withMedia();
    setSize(media(), 640, 480);
    for (let index = 0; index < 4; index++) await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(calls.filter((call) => call.uri.endsWith('/setDisplayWindow')).length).toBeGreaterThan(2);
    reply = () => ({ returnValue: false, errorCode: 1 });
    for (let index = 0; index < 8; index++) await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const total = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(calls.length).toBe(total);
  });

  it('refreshes the output window while a custom ratio is active and stops on unmount', async () => {
    vi.useFakeTimers();
    setSetting('aspectRatio', 'zoom');
    const { unmount } = setup();
    withMedia();
    setSize(media(), 640, 480);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const first = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(calls.length).toBeGreaterThan(first);
    unmount();
    const after = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(calls.length).toBe(after);
  });

  it('does nothing for auto until a custom ratio was applied, and waits for the video size', async () => {
    setup();
    withMedia();
    fireEvent(media(), new Event('loadedmetadata'));
    await settle();
    expect(calls).toHaveLength(0);
    setSetting('aspectRatio', 'zoom');
    setup();
    fireEvent(media(), new Event('resize'));
    await settle();
    expect(calls.some((call) => call.uri.endsWith('/setDisplayWindow'))).toBe(false);
  });

  it('tells the user when the TV refuses the speed', async () => {
    vi.useFakeTimers();
    setSetting('playbackSpeed', 2);
    reply = () => ({ returnValue: false });
    setup();
    withMedia();
    for (let index = 0; index < 4; index++) await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(document.querySelector('.player__toast')?.textContent).toBe('Playback speed is not available on this device');
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    openMenu();
    expect(menuEntries()).toContain('Playback Speed1\u00d7');
  });

  it('waits for the media id before speeding up', async () => {
    vi.useFakeTimers();
    setSetting('playbackSpeed', 1.25);
    setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(calls).toHaveLength(0);
    withMedia();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(calls.some((call) => call.uri.endsWith('/setPlayRate'))).toBe(true);
  });
});

describe('Timeline', () => {
  it('shows times and buffered progress', () => {
    const element = document.createElement('video');
    setMedia(element, { currentTime: 65, duration: 3700 });
    Object.defineProperty(element, 'buffered', { value: { length: 1, end: () => 1850 }, configurable: true });
    const ref = { current: element };
    render(<Timeline videoRef={ref} focused />);
    fireEvent(element, new Event('timeupdate'));
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('1:01:40')).toBeInTheDocument();
    expect(document.querySelector('.timeline__bar--active')).not.toBeNull();
    expect((document.querySelector('.timeline__fill') as HTMLElement).style.transform).toContain('scaleX(0.017');
  });

  it('copes with a missing element and unknown durations', () => {
    const element = document.createElement('video');
    const { rerender } = render(<Timeline videoRef={{ current: null }} focused={false} />);
    rerender(<Timeline videoRef={{ current: element }} focused={false} />);
    const bar = document.querySelector('.timeline__bar') as HTMLElement;
    fireEvent.click(bar, { clientX: 10 });
    expect(screen.getAllByText('0:00')).toHaveLength(2);
  });
});

describe('Timeline handle and dragging', () => {
  const trackRect = { left: 100, width: 1000, top: 0, right: 1100, bottom: 40, height: 40, x: 100, y: 0, toJSON: () => ({}) };
  const at = (ratio: number) => 100 + ratio * 1000;
  const trackOf = () => {
    const element = document.querySelector('.timeline__track') as HTMLElement;
    element.getBoundingClientRect = () => trackRect;
    return element;
  };
  const fillOf = () => document.querySelector('.timeline__fill') as HTMLElement;
  const handleOf = () => document.querySelector('.timeline__handle') as HTMLElement;
  const labelOf = () => document.querySelector('.timeline__label') as HTMLElement;
  const elapsed = () => document.querySelector('.timeline__time') as HTMLElement;

  function mount(state: { duration?: number; currentTime?: number } = {}, props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
    const element = document.createElement('video');
    setMedia(element, { duration: 1000, currentTime: 0, ...state });
    const view = render(<Timeline videoRef={{ current: element }} focused={false} {...props} />);
    return { element, track: trackOf(), ...view };
  }

  it('puts the handle on the current position and moves it with the video', () => {
    const { element } = mount({ currentTime: 250 });
    expect(handleOf().style.left).toBe('25%');
    element.currentTime = 500;
    fireEvent(element, new Event('timeupdate'));
    expect(handleOf().style.left).toBe('50%');
    expect(fillOf().style.transform).toBe('scaleX(0.5)');
    element.currentTime = 5000;
    fireEvent(element, new Event('timeupdate'));
    expect(handleOf().style.left).toBe('100%');
  });

  it('seeks to the pressed spot at once, so a plain click works', () => {
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.6) });
    expect(element.currentTime).toBe(600);
    fireEvent.mouseUp(window, { clientX: at(0.6) });
    expect(element.currentTime).toBe(600);
    expect(handleOf().style.left).toBe('60%');
    expect(elapsed().textContent).toBe('10:00');
  });

  it('ignores the other mouse buttons', () => {
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.6), button: 2 });
    expect(element.currentTime).toBe(0);
  });

  it('follows the pointer at once but seeks the video throttled, then once more on release', () => {
    vi.useFakeTimers();
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.1) });
    expect(element.currentTime).toBe(100);
    fireEvent.mouseMove(window, { clientX: at(0.5) });
    expect(fillOf().style.transform).toBe('scaleX(0.5)');
    expect(handleOf().style.left).toBe('50%');
    expect(elapsed().textContent).toBe('8:20');
    expect(element.currentTime).toBe(100);
    act(() => { vi.advanceTimersByTime(150); });
    expect(element.currentTime).toBe(500);
    fireEvent.mouseMove(window, { clientX: at(0.7) });
    fireEvent.mouseMove(window, { clientX: at(0.8) });
    expect(element.currentTime).toBe(500);
    expect(elapsed().textContent).toBe('13:20');
    fireEvent.mouseUp(window, { clientX: at(0.9) });
    expect(element.currentTime).toBe(900);
    expect(handleOf().style.left).toBe('90%');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(element.currentTime).toBe(900);
  });

  it('does not let the video clock pull the bar back while dragging', () => {
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    element.currentTime = 20;
    fireEvent(element, new Event('timeupdate'));
    expect(handleOf().style.left).toBe('50%');
    expect(fillOf().style.transform).toBe('scaleX(0.5)');
    expect(elapsed().textContent).toBe('8:20');
    fireEvent.mouseUp(window, { clientX: at(0.5) });
    fireEvent(element, new Event('timeupdate'));
    expect(handleOf().style.left).toBe('50%');
  });

  it('clamps the drag to the bar when the pointer leaves it', () => {
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    fireEvent.mouseMove(window, { clientX: -300 });
    expect(handleOf().style.left).toBe('0%');
    expect(fillOf().style.transform).toBe('scaleX(0)');
    fireEvent.mouseUp(window, { clientX: -300 });
    expect(element.currentTime).toBe(0);
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    fireEvent.mouseMove(window, { clientX: 9000 });
    expect(handleOf().style.left).toBe('100%');
    fireEvent.mouseUp(window, { clientX: 9000 });
    expect(element.currentTime).toBe(1000);
  });

  it('stops listening to the window after the release', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { element, track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.2) });
    expect(add.mock.calls.filter(([name]) => name === 'mousemove' || name === 'mouseup')).toHaveLength(2);
    fireEvent.mouseUp(window, { clientX: at(0.2) });
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['mousemove', 'mouseup']));
    element.currentTime = 7;
    fireEvent.mouseMove(window, { clientX: at(0.9) });
    fireEvent.mouseUp(window, { clientX: at(0.9) });
    expect(element.currentTime).toBe(7);
    expect(handleOf().style.left).toBe('20%');
  });

  it('cleans up when it unmounts in the middle of a drag', () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { element, track, unmount } = mount({}, { onActivity });
    fireEvent.mouseDown(track, { clientX: at(0.2) });
    fireEvent.mouseMove(window, { clientX: at(0.4) });
    unmount();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['mousemove', 'mouseup']));
    const pings = onActivity.mock.calls.length;
    element.currentTime = 7;
    fireEvent.mouseMove(window, { clientX: at(0.9) });
    fireEvent.mouseUp(window, { clientX: at(0.9) });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(element.currentTime).toBe(7);
    expect(onActivity).toHaveBeenCalledTimes(pings);
  });

  it('drags with a finger as well', () => {
    vi.useFakeTimers();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { element, track } = mount();
    fireEvent.touchStart(track, { touches: [{ clientX: at(0.1) }] });
    expect(element.currentTime).toBe(100);
    expect(add.mock.calls.filter(([name]) => name === 'touchmove')).toHaveLength(1);
    fireEvent.touchMove(window, { touches: [{ clientX: at(0.5) }] });
    expect(handleOf().style.left).toBe('50%');
    expect(elapsed().textContent).toBe('8:20');
    expect(element.currentTime).toBe(100);
    fireEvent.touchEnd(window, { changedTouches: [{ clientX: at(0.75) }] });
    expect(element.currentTime).toBe(750);
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['touchmove', 'touchend', 'touchcancel']));
    fireEvent.touchMove(window, { touches: [{ clientX: at(0.9) }] });
    expect(handleOf().style.left).toBe('75%');
  });

  it('ends a touch drag that the system cancels where it stopped', () => {
    const { element, track } = mount();
    fireEvent.touchStart(track, { touches: [{ clientX: at(0.1) }] });
    fireEvent.touchMove(window, { touches: [{ clientX: at(0.3) }] });
    fireEvent.touchCancel(window, { changedTouches: [] });
    expect(element.currentTime).toBe(300);
    expect(handleOf().style.left).toBe('30%');
  });

  it('ignores the mouse events that follow a tap', () => {
    const { element, track } = mount();
    fireEvent.touchStart(track, { touches: [{ clientX: at(0.4) }] });
    fireEvent.touchEnd(window, { changedTouches: [{ clientX: at(0.4) }] });
    expect(element.currentTime).toBe(400);
    fireEvent.mouseMove(track, { clientX: at(0.4) });
    fireEvent.mouseEnter(track);
    fireEvent.mouseDown(track, { clientX: at(0.9) });
    expect(element.currentTime).toBe(400);
    expect(labelOf()).not.toHaveClass('timeline__label--visible');
    expect(handleOf()).not.toHaveClass('timeline__handle--active');
  });

  it('shows the time under the pointer while hovering and hides it when the pointer leaves', () => {
    const { track } = mount();
    expect(labelOf()).not.toHaveClass('timeline__label--visible');
    fireEvent.mouseMove(track, { clientX: at(0.5) });
    expect(labelOf()).toHaveClass('timeline__label--visible');
    expect(labelOf().textContent).toBe('8:20');
    expect(labelOf().style.left).toBe('50%');
    fireEvent.mouseMove(track, { clientX: at(0.25) });
    expect(labelOf().textContent).toBe('4:10');
    fireEvent.mouseLeave(track);
    expect(labelOf()).not.toHaveClass('timeline__label--visible');
  });

  it('shows the label while dragging, also after the pointer has left the bar', () => {
    const { track } = mount();
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    expect(labelOf()).toHaveClass('timeline__label--visible');
    fireEvent.mouseLeave(track);
    fireEvent.mouseMove(window, { clientX: at(0.75) });
    expect(labelOf()).toHaveClass('timeline__label--visible');
    expect(labelOf().textContent).toBe('12:30');
    fireEvent.mouseUp(window, { clientX: at(0.75) });
    expect(labelOf()).not.toHaveClass('timeline__label--visible');
  });

  it('grows the handle while hovering, dragging and focused, and shows no label for the remote', () => {
    const { track, rerender, element } = mount();
    expect(handleOf()).not.toHaveClass('timeline__handle--active');
    fireEvent.mouseEnter(track);
    expect(handleOf()).toHaveClass('timeline__handle--active');
    fireEvent.mouseLeave(track);
    expect(handleOf()).not.toHaveClass('timeline__handle--active');
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    expect(handleOf()).toHaveClass('timeline__handle--active');
    fireEvent.mouseUp(window, { clientX: at(0.5) });
    expect(handleOf()).not.toHaveClass('timeline__handle--active');
    rerender(<Timeline videoRef={{ current: element }} focused />);
    expect(handleOf()).toHaveClass('timeline__handle--active');
    expect(labelOf()).not.toHaveClass('timeline__label--visible');
    expect(document.querySelector('.timeline__bar')).toHaveClass('timeline__bar--active');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0])('does nothing while the duration is %s', (duration) => {
    const add = vi.spyOn(window, 'addEventListener');
    const { element, track } = mount({ duration });
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    fireEvent.mouseMove(window, { clientX: at(0.8) });
    fireEvent.mouseUp(window, { clientX: at(0.8) });
    fireEvent.touchStart(track, { touches: [{ clientX: at(0.5) }] });
    expect(element.currentTime).toBe(0);
    expect(handleOf().style.left).toBe('0%');
    expect(fillOf().style.transform).toBe('scaleX(0)');
    expect(add.mock.calls.filter(([name]) => name === 'mousemove' || name === 'touchmove')).toHaveLength(0);
    expect(handleOf()).not.toHaveClass('timeline__handle--active');
  });

  it('shows 0:00 under the pointer while the duration is unknown', () => {
    const { track } = mount({ duration: Number.NaN });
    fireEvent.mouseMove(track, { clientX: at(0.5) });
    expect(labelOf().textContent).toBe('0:00');
  });

  it('reports pointer activity so the player can keep the controls up', () => {
    vi.useFakeTimers();
    const onActivity = vi.fn();
    const { track } = mount({}, { onActivity });
    fireEvent.mouseMove(track, { clientX: at(0.3) });
    expect(onActivity).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(track, { clientX: at(0.3) });
    const pressed = onActivity.mock.calls.length;
    expect(pressed).toBeGreaterThan(1);
    fireEvent.mouseMove(window, { clientX: at(0.6) });
    expect(onActivity).toHaveBeenCalledTimes(pressed + 1);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(onActivity.mock.calls.length).toBeGreaterThanOrEqual(pressed + 1 + 3);
    fireEvent.mouseUp(window, { clientX: at(0.6) });
    const released = onActivity.mock.calls.length;
    act(() => { vi.advanceTimersByTime(3500); });
    expect(onActivity).toHaveBeenCalledTimes(released);
  });

  it('works without an activity callback', () => {
    const { track } = mount();
    fireEvent.mouseMove(track, { clientX: at(0.3) });
    fireEvent.mouseDown(track, { clientX: at(0.3) });
    fireEvent.mouseUp(window, { clientX: at(0.3) });
  });

  it('keeps the player controls on screen during a drag and hides them afterwards', () => {
    vi.useFakeTimers();
    setup();
    setMedia(media(), { duration: 600, currentTime: 0 });
    act(() => { fireEvent(media(), new Event('play')); });
    const visible = () => document.querySelector('.player__controls--visible') !== null;
    expect(visible()).toBe(true);
    const track = trackOf();
    fireEvent.mouseDown(track, { clientX: at(0.5) });
    expect(media().currentTime).toBe(300);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(visible()).toBe(true);
    fireEvent.mouseUp(window, { clientX: at(0.5) });
    act(() => { vi.advanceTimersByTime(3900); });
    expect(visible()).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(visible()).toBe(false);
  });

  it('keeps the player controls on screen while the pointer moves over the bar', () => {
    vi.useFakeTimers();
    setup();
    act(() => { fireEvent(media(), new Event('play')); });
    const track = trackOf();
    for (let step = 0; step < 4; step++) {
      act(() => { vi.advanceTimersByTime(3000); });
      fireEvent.mouseMove(track, { clientX: at(0.5) });
    }
    expect(document.querySelector('.player__controls--visible')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(4100); });
    expect(document.querySelector('.player__controls--visible')).toBeNull();
  });
});

describe('Timeline styles', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../app/styles/styles.css'), 'utf8');

  it('makes the handle a round, absolutely placed dot', () => {
    const rules = cssRules(css, '.timeline__handle');
    expect(rules).toHaveLength(1);
    expect(rules[0].position).toBe('absolute');
    expect(rules[0]['border-radius']).toBe('50%');
    expect(rules[0].width).toBe(rules[0].height);
    expect(cssRules(css, '.timeline__handle--active')[0]['box-shadow']).toContain('var(--accent)');
  });

  it('gives the bar a tall track that takes the pointer', () => {
    const track = cssRules(css, '.timeline__track');
    expect(track).toHaveLength(1);
    expect(track[0].cursor).toBe('pointer');
    expect(track[0].position).toBe('relative');
    expect(track[0].flex).toBe('1');
    expect(parseInt(track[0].height, 10)).toBeGreaterThanOrEqual(40);
  });

  it('keeps the bar clipping its rounded fill', () => {
    const bar = cssRules(css, '.timeline__bar');
    expect(bar).toHaveLength(1);
    expect(bar[0].overflow).toBe('hidden');
    expect(bar[0].height).toBe('10px');
  });

  it('keeps the time label above the track without catching the pointer', () => {
    const rules = cssRules(css, '.timeline__label');
    expect(rules[0].position).toBe('absolute');
    expect(rules[0].bottom).toBe('100%');
    expect(rules[0]['pointer-events']).toBe('none');
    expect(cssRules(css, '.timeline__label--visible')[0].visibility).toBe('visible');
  });

  it('avoids what Chrome 68 does not know', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]*\.timeline[^{}]*\{[^{}]*\}/g) || [];
    expect(rules.length).toBeGreaterThan(8);
    rules.forEach((rule) => expect(rule).not.toMatch(/aspect-ratio|inset\s*:|:focus-visible|\bgap\s*:/));
  });
});

describe('useSeek', () => {
  it('does nothing without a video', () => {
    function View() {
      const seek = useSeek({ current: null });
      return <button onClick={() => seek(1)}>seek</button>;
    }
    render(<View />);
    fireEvent.click(screen.getByText('seek'));
  });
});
