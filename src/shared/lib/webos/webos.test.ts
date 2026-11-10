import { afterEach, describe, expect, it, vi } from 'vitest';
import { callLuna, isWebOS } from './luna';
import { applyPlayRate } from './playRate';
import { applyOutputWindow, computeOutputWindow, usesOutputWindow } from './videoWindow';

type Bridge = { onservicecallback: (message: string) => void; call: (uri: string, params: string) => void; cancel: () => void };

function stubBridge(behaviour: (bridge: Bridge, uri: string, params: string) => void) {
  const created: Bridge[] = [];
  vi.stubGlobal('PalmServiceBridge', class {
    onservicecallback: (message: string) => void = () => {};
    constructor() { created.push(this as unknown as Bridge); }
    call(uri: string, params: string) { behaviour(this as unknown as Bridge, uri, params); }
    cancel() {}
  });
  return created;
}

const video = (props: Partial<Record<'videoWidth' | 'videoHeight' | 'mediaId', unknown>>) => {
  const element = document.createElement('video');
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(element, key, { value, configurable: true }));
  return element;
};

afterEach(() => { vi.useRealTimers(); });

describe('callLuna', () => {
  it('resolves with the reply of the service', async () => {
    stubBridge((bridge) => bridge.onservicecallback('{"returnValue":true}'));
    expect(await callLuna('luna://x/y', { a: 1 })).toEqual({ returnValue: true });
  });

  it('reports unreadable replies, a missing bridge and bridges that throw', async () => {
    stubBridge((bridge) => bridge.onservicecallback('nonsense'));
    expect(await callLuna('luna://x/y', {})).toEqual({ returnValue: false });
    vi.unstubAllGlobals();
    expect(await callLuna('luna://x/y', {})).toEqual({ returnValue: false });
    stubBridge(() => { throw new Error('denied'); });
    expect(await callLuna('luna://x/y', {})).toEqual({ returnValue: false });
  });

  it('gives up when the service never answers and survives a failing cancel', async () => {
    vi.useFakeTimers();
    const created = stubBridge(() => {});
    const pending = callLuna('luna://x/y', {});
    created[0].cancel = () => { throw new Error('gone'); };
    await vi.advanceTimersByTimeAsync(5100);
    expect(await pending).toEqual({ returnValue: false });
  });

  it('recognizes webOS by its bridge', () => {
    expect(isWebOS()).toBe(false);
    stubBridge(() => {});
    expect(isWebOS()).toBe(true);
  });
});

describe('applyPlayRate', () => {
  it('sets the rate of the element outside webOS', async () => {
    const element = video({});
    expect(await applyPlayRate(element, 1.5)).toBe('ok');
    expect(element.playbackRate).toBe(1.5);
    expect(element.defaultPlaybackRate).toBe(1.5);
  });

  it('asks the media service on webOS', async () => {
    const seen: string[] = [];
    stubBridge((bridge, uri, params) => { seen.push(uri, params); bridge.onservicecallback('{"returnValue":true}'); });
    expect(await applyPlayRate(video({}), 2)).toBe('pending');
    expect(await applyPlayRate(video({ mediaId: 'm1' }), 2)).toBe('ok');
    expect(seen[0]).toBe('luna://com.webos.media/setPlayRate');
    expect(JSON.parse(seen[1])).toEqual({ mediaId: 'm1', playRate: 2, audioOutput: true });
    stubBridge((bridge) => bridge.onservicecallback('{"returnValue":false}'));
    expect(await applyPlayRate(video({ mediaId: 'm1' }), 2)).toBe('failed');
  });
});

describe('usesOutputWindow', () => {
  const agent = (value: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);

  it('is only needed on webOS browsers without object-fit support on the video plane', () => {
    agent('Chrome/68.0.3440.106');
    expect(usesOutputWindow()).toBe(false);
    stubBridge(() => {});
    expect(usesOutputWindow()).toBe(true);
    agent('Chrome/79.0.3945.79');
    expect(usesOutputWindow()).toBe(false);
    agent('Something else');
    expect(usesOutputWindow()).toBe(false);
  });
});

describe('computeOutputWindow', () => {
  it('fits the video into the screen by default', () => {
    expect(computeOutputWindow('auto', 640, 480, 1920, 1080)).toEqual({
      original: { x: 0, y: 0, width: 640, height: 480 },
      source: { x: 0, y: 0, width: 640, height: 480 },
      output: { x: 240, y: 0, width: 1440, height: 1080 },
    });
    expect(computeOutputWindow('auto', 2560, 800, 1920, 1080).output).toEqual({ x: 0, y: 240, width: 1920, height: 600 });
  });

  it('stretches the whole picture over the screen', () => {
    const { source, output } = computeOutputWindow('stretch', 640, 480, 1920, 1080);
    expect(output).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(source).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  });

  it('crops the picture so it fills the screen', () => {
    expect(computeOutputWindow('zoom', 640, 480, 1920, 1080).source).toEqual({ x: 0, y: 60, width: 640, height: 360 });
    expect(computeOutputWindow('zoom', 2560, 800, 1920, 1080).source).toEqual({ x: 569, y: 0, width: 1422, height: 800 });
  });
});

describe('applyOutputWindow', () => {
  it('waits for the picture size and the media id', async () => {
    expect(await applyOutputWindow(video({}), 'zoom')).toBe('wait');
    expect(await applyOutputWindow(video({ videoWidth: 640, videoHeight: 480 }), 'zoom')).toBe('pending');
  });

  it('reports what the video output service answered', async () => {
    const element = video({ videoWidth: 640, videoHeight: 480, mediaId: 'm1' });
    stubBridge((bridge) => bridge.onservicecallback('{"returnValue":true}'));
    expect(await applyOutputWindow(element, 'zoom')).toBe('ok');
    stubBridge((bridge) => bridge.onservicecallback('{"returnValue":false,"errorCode":53}'));
    expect(await applyOutputWindow(element, 'zoom')).toBe('pending');
    stubBridge((bridge) => bridge.onservicecallback('{"returnValue":false,"errorCode":7}'));
    expect(await applyOutputWindow(element, 'zoom')).toBe('failed');
  });

  it('falls back to the window size when the screen reports none', async () => {
    const element = video({ videoWidth: 640, videoHeight: 480, mediaId: 'm1' });
    const sent: string[] = [];
    stubBridge((bridge, _uri, params) => { sent.push(params); bridge.onservicecallback('{"returnValue":true}'); });
    vi.spyOn(window.screen, 'width', 'get').mockReturnValue(0);
    vi.spyOn(window.screen, 'height', 'get').mockReturnValue(0);
    await applyOutputWindow(element, 'stretch');
    expect(JSON.parse(sent[0]).displayOutput).toEqual({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  });
});
