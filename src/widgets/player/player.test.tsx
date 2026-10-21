import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, claim, flush, mockFetch, rpcResult, video } from '../../../tests/helpers';
import type { Video } from '@/entities/video';
import { invalidate } from '@/shared/api';
import { setSetting } from '@/shared/config/settings';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { getSavedPosition, savePlaybackPosition } from '@/features/playback-history';
import { Player } from './ui/Player';
import { Timeline } from './ui/Timeline';
import { useSeek } from './model/useSeek';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });
const sample = video('vid1') as Video;

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
  invalidate();
  setSetting('autoplay', true);
  setSetting('resume', true);
  setSetting('quality', 'auto');
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  mockApi();
});

describe('Player playback', () => {
  it('loads the stream and shows details', () => {
    setup();
    expect(media().src).toContain('/api/v3/streams/free/name-vid1/vid1/abcdef');
    expect(screen.getByText('Video vid1')).toBeInTheDocument();
    expect(document.querySelector('.player__buffering')).not.toBeNull();
    fireEvent(media(), new Event('playing'));
    expect(document.querySelector('.player__buffering')).toBeNull();
  });

  it('uses the selected quality', () => {
    setSetting('quality', '720');
    setup();
    expect(media().src).toContain('/api/v4/streams/tc/name-vid1/vid1/abcdef?quality=720p');
  });

  it('resumes from the saved position once metadata is known', () => {
    savePlaybackPosition(sample, 120, 600);
    setup();
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(120);
  });

  it('prefers an explicit start position and skips resuming near the end', () => {
    savePlaybackPosition(sample, 120, 600);
    setup({ startAt: 30 });
    setMedia(media(), { currentTime: 0, duration: 600 });
    fireEvent(media(), new Event('loadedmetadata'));
    expect(media().currentTime).toBe(30);
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

  it('plays the next video of the channel when it ends', async () => {
    const { onPlayNext } = setup();
    await act(async () => { for (let index = 0; index < 12; index++) await flush(); });
    vi.useFakeTimers();
    fireEvent(media(), new Event('ended'));
    act(() => { vi.advanceTimersByTime(600); });
    expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'next1' }));
  });

  it('shows errors and retries on OK', () => {
    setup();
    Object.defineProperty(media(), 'error', { value: { message: 'bad' }, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(screen.getByText('Video playback error: bad')).toBeInTheDocument();
    const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    press(13);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(loads);
  });

  it('shows an error when playback cannot start', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
    setup();
    expect(await screen.findByText('Failed to play video: blocked')).toBeInTheDocument();
  });

  it('describes unknown playback errors', () => {
    setup();
    Object.defineProperty(media(), 'error', { value: null, configurable: true });
    fireEvent(media(), new Event('error'));
    expect(screen.getByText('Video playback error: Unknown error')).toBeInTheDocument();
  });

  it('shows the buffering state while waiting', () => {
    setup();
    fireEvent(media(), new Event('canplay'));
    expect(document.querySelector('.player__buffering')).toBeNull();
    fireEvent(media(), new Event('waiting'));
    expect(document.querySelector('.player__buffering')).not.toBeNull();
  });
});

describe('Player remote control', () => {
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
    const bar = document.querySelector('.timeline__bar') as HTMLElement;
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(bar, { clientX: 100 });
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
    const buttons = document.querySelectorAll('.player__group .pbtn');
    fireEvent.click(buttons[1]);
    fireEvent.click(document.querySelector('.player__group--right .pbtn') as HTMLElement);
    expect(document.querySelector('.pbtn--on')).toBeNull();
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
