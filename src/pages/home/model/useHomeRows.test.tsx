import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, jsonResponse, mockFetch, rpcResult, video } from '../../../../tests/helpers';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { refreshHomepage } from '@/entities/category';
import type { Video } from '@/entities/video';
import type { VideoRow } from '@/widgets/video-rows';
import { session } from '@/entities/session/model/store';
import { clearPlaybackHistory, savePlaybackPosition } from '@/features/playback-history';
import { resetLayout } from '@/features/customize-layout/model/layout';
import { useHomeRows } from './useHomeRows';

const content = {
  status: 'success',
  data: { en: { categories: {
    PRIMARY_CONTENT: { label: 'Featured', channelIds: ['f1'], sortOrder: 2, pageSize: 6 },
    A: { label: 'Alpha', channelIds: ['a1'], sortOrder: 10, pageSize: 6 },
    B: { label: 'Bravo', channelIds: ['b1'], sortOrder: 20, pageSize: 6 },
    C: { label: 'Charlie', channelIds: ['c1'], sortOrder: 30, pageSize: 6 },
    D: { label: 'Delta', channelIds: ['d1'], sortOrder: 40, pageSize: 6 },
    E: { label: 'Echo', channelIds: ['e1'], sortOrder: 50, pageSize: 6 },
  } } },
};

beforeEach(async () => {
  invalidate();
  forgetRemembered();
  localStorage.clear();
  session.set({ token: null, user: null });
  clearPlaybackHistory();
  resetLayout('home');
  mockFetch((url, init) => {
    if (url.includes('/content/v2/get')) return content;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method !== 'claim_search') return rpcResult({});
    const tag = (body.params.channel_ids || ['all'])[0];
    return rpcResult({ items: Array.from({ length: body.params.page_size }, (_, index) => claim(`${tag}-${body.params.page}-${index}`)) });
  });
  await act(async () => { await refreshHomepage(true); });
});

const byId = (rows: VideoRow[], id: string) => rows.find((row) => row.id === id);

describe('useHomeRows row identity', () => {
  it('keeps a row that did not change as the same object while another row loads', async () => {
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(byId(result.current.rows, 'C')?.status).toBe('ready'));
    await waitFor(() => expect(result.current.rows.filter((row) => row.status === 'ready')).toHaveLength(4));
    const before = result.current.rows;
    expect(byId(before, 'D')?.status).toBe('idle');
    act(() => { result.current.ensure('D'); });
    await waitFor(() => expect(byId(result.current.rows, 'D')?.status).toBe('ready'));
    const after = result.current.rows;
    ['PRIMARY_CONTENT', 'A', 'B', 'C'].forEach((id) => expect(byId(after, id)).toBe(byId(before, id)));
    expect(byId(after, 'D')).not.toBe(byId(before, 'D'));
  });

  it('gives every row the same empty list and status until it loads', async () => {
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(4));
    const idle = result.current.rows.filter((row) => row.status === 'idle');
    expect(idle.length).toBeGreaterThan(1);
    expect(new Set(idle.map((row) => row.videos)).size).toBe(1);
  });

  it('keeps one watch progress function for all rows until the history changes', async () => {
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(byId(result.current.rows, 'B')?.status).toBe('ready'));
    const progress = byId(result.current.rows, 'A')?.progress;
    expect(progress).toBeTypeOf('function');
    expect(byId(result.current.rows, 'B')?.progress).toBe(progress);
    act(() => { result.current.ensure('D'); });
    await waitFor(() => expect(byId(result.current.rows, 'D')?.status).toBe('ready'));
    expect(byId(result.current.rows, 'A')?.progress).toBe(progress);
    act(() => { savePlaybackPosition(video('a1-1-0') as Video, 60, 600); });
    await waitFor(() => expect(byId(result.current.rows, 'A')?.progress).not.toBe(progress));
    expect(byId(result.current.rows, 'A')?.progress?.(video('a1-1-0') as Video)).toBe(10);
  });

  it('keeps the Continue Watching row as the same object while another row loads', async () => {
    act(() => { savePlaybackPosition(video('seen') as Video, 60, 600); });
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(byId(result.current.rows, 'C')?.status).toBe('ready'));
    const before = byId(result.current.rows, 'continue');
    expect(before?.videos).toHaveLength(1);
    act(() => { result.current.ensure('D'); });
    await waitFor(() => expect(byId(result.current.rows, 'D')?.status).toBe('ready'));
    expect(byId(result.current.rows, 'continue')).toBe(before);
  });
});

describe('useHomeRows request order', () => {
  let release: () => void = () => {};
  afterEach(() => { release(); });

  function controlled() {
    const asked: string[] = [];
    const waiting = new Map<string, Array<(ok: boolean) => void>>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/content/v2/get')) return jsonResponse(content);
      const body = JSON.parse(String(init?.body));
      if (body.method !== 'claim_search') return jsonResponse(rpcResult({}));
      const channel = body.params.channel_ids[0] as string;
      asked.push(channel);
      const ok = await new Promise<boolean>((resolve) => { waiting.set(channel, [...(waiting.get(channel) || []), resolve]); });
      if (!ok) return jsonResponse({ error: { message: 'down' } });
      return jsonResponse(rpcResult({ items: Array.from({ length: body.params.page_size }, (_, index) => claim(`${channel}-${body.params.page}-${index}`)) }));
    }));
    release = () => { waiting.forEach((list) => list.forEach((resolve) => resolve(true))); waiting.clear(); };
    const answer = async (channel: string, ok = true) => { await act(async () => { (waiting.get(channel) || []).forEach((resolve) => resolve(ok)); waiting.delete(channel); }); };
    return { asked, answer };
  }

  it('asks for the rows on screen first and for the rows below them when those have arrived', async () => {
    const { asked, answer } = controlled();
    renderHook(() => useHomeRows());
    await waitFor(() => expect(asked).toEqual(['f1', 'a1']));
    await answer('f1');
    expect(asked).toEqual(['f1', 'a1']);
    await answer('a1');
    await waitFor(() => expect(asked).toEqual(['f1', 'a1', 'b1', 'c1']));
  });

  it('asks for the rows below the screen even when a row on screen fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { asked, answer } = controlled();
    renderHook(() => useHomeRows());
    await waitFor(() => expect(asked).toEqual(['f1', 'a1']));
    await answer('f1', false);
    await answer('a1');
    await waitFor(() => expect(asked).toEqual(['f1', 'a1', 'b1', 'c1']));
  });

  it('does not ask again for a row that has been loaded while it waited', async () => {
    const { asked, answer } = controlled();
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(asked).toEqual(['f1', 'a1']));
    act(() => { result.current.ensure('C'); });
    await waitFor(() => expect(asked).toEqual(['f1', 'a1', 'c1', 'd1']));
    await answer('c1');
    await answer('f1');
    await answer('a1');
    await waitFor(() => expect(asked).toContain('b1'));
    expect(asked.filter((channel) => channel === 'c1')).toHaveLength(1);
  });
});

describe('useHomeRows loading around the focus', () => {
  it('also loads the rows above the one that gets the focus, so that going up from the end finds them ready', async () => {
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(result.current.rows.filter((row) => row.status === 'ready')).toHaveLength(4));
    expect(byId(result.current.rows, 'D')?.status).toBe('idle');
    act(() => { result.current.ensure('E'); });
    await waitFor(() => expect(byId(result.current.rows, 'E')?.status).toBe('ready'));
    await waitFor(() => expect(byId(result.current.rows, 'D')?.status).toBe('ready'));
  });

  it('loads nothing above the first row', async () => {
    const { result } = renderHook(() => useHomeRows());
    await waitFor(() => expect(result.current.rows.filter((row) => row.status === 'ready')).toHaveLength(4));
    act(() => { result.current.ensure('PRIMARY_CONTENT'); });
    expect(byId(result.current.rows, 'D')?.status).toBe('idle');
    expect(byId(result.current.rows, 'E')?.status).toBe('idle');
  });
});
