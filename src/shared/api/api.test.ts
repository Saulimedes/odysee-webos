import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, jsonResponse, mockFetch, rpcResult } from '../../../tests/helpers';
import { createLimiter } from './limiter';

beforeEach(() => { vi.resetModules(); });

describe('cache', () => {
  it('serves fresh values without refetching and dedupes in flight calls', async () => {
    const { query } = await import('./cache');
    const fetcher = vi.fn(async () => 'value');
    const [a, b] = await Promise.all([query('k', fetcher, { ttl: 1000 }), query('k', fetcher, { ttl: 1000 })]);
    expect(a).toBe('value');
    expect(b).toBe('value');
    await query('k', fetcher, { ttl: 1000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches stale entries and reports staleness through peek', async () => {
    const { query, peek } = await import('./cache');
    vi.useFakeTimers();
    await query('k', async () => 1, { ttl: 1000 });
    expect(peek('k', { ttl: 1000 })).toEqual({ value: 1, stale: false });
    vi.advanceTimersByTime(2000);
    expect(peek('k', { ttl: 1000 })).toEqual({ value: 1, stale: true });
    expect(await query('k', async () => 2, { ttl: 1000 })).toBe(2);
  });

  it('does not cache rejected calls', async () => {
    const { query } = await import('./cache');
    await expect(query('k', async () => { throw new Error('nope'); }, { ttl: 1000 })).rejects.toThrow('nope');
    expect(await query('k', async () => 'ok', { ttl: 1000 })).toBe('ok');
  });

  it('persists entries to storage and restores them in a new session', async () => {
    const first = await import('./cache');
    await first.query('p', async () => ({ a: 1 }), { ttl: 1000, persist: true });
    expect(localStorage.getItem('cache:p')).toContain('"a":1');
    vi.resetModules();
    const second = await import('./cache');
    expect(second.peek('p', { ttl: 1000, persist: true })?.value).toEqual({ a: 1 });
    expect(second.peek('p', { ttl: 1000 })?.value).toEqual({ a: 1 });
  });

  it('ignores corrupt persisted entries and skips oversized ones', async () => {
    localStorage.setItem('cache:bad', '{"nope":1}');
    const { peek, store } = await import('./cache');
    expect(peek('bad', { ttl: 1, persist: true })).toBeUndefined();
    store('big', 'x'.repeat(300000), true);
    expect(localStorage.getItem('cache:big')).toBeNull();
  });

  it('evicts the oldest entries beyond the limit', async () => {
    const { store, peek } = await import('./cache');
    for (let index = 0; index < 170; index++) store(`k${index}`, index);
    expect(peek('k0', { ttl: 1000 })).toBeUndefined();
    expect(peek('k169', { ttl: 1000 })?.value).toBe(169);
  });

  it('prunes old and unreadable persisted entries', async () => {
    const { store, pruneCache } = await import('./cache');
    store('fresh', 1, true);
    localStorage.setItem('cache:old', JSON.stringify({ v: 1, t: Date.now() - 10 * 86400000 }));
    localStorage.setItem('cache:broken', '{');
    localStorage.setItem('keep', '1');
    pruneCache(86400000);
    expect(localStorage.getItem('cache:fresh')).not.toBeNull();
    expect(localStorage.getItem('cache:old')).toBeNull();
    expect(localStorage.getItem('cache:broken')).toBeNull();
    expect(localStorage.getItem('keep')).toBe('1');
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('denied'); });
    expect(() => pruneCache(1)).not.toThrow();
  });

  it('invalidates by prefix in memory and storage', async () => {
    const { store, invalidate, peek } = await import('./cache');
    store('a:1', 1, true);
    store('b:1', 2, true);
    invalidate('a:');
    expect(peek('a:1', { ttl: 1000, persist: true })).toBeUndefined();
    expect(peek('b:1', { ttl: 1000 })?.value).toBe(2);
    invalidate();
    expect(peek('b:1', { ttl: 1000, persist: true })).toBeUndefined();
  });
});

describe('limiter', () => {
  it('runs at most the limit at once and prefers higher priority', async () => {
    const run = createLimiter(1);
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = run(async () => { order.push('first'); await gate; });
    const low = run(async () => { order.push('low'); }, 0);
    const high = run(async () => { order.push('high'); }, 5);
    await flush();
    expect(order).toEqual(['first']);
    release();
    await Promise.all([first, low, high]);
    expect(order).toEqual(['first', 'high', 'low']);
  });

  it('propagates errors and keeps going', async () => {
    const run = createLimiter(1);
    await expect(run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await run(async () => 'ok')).toBe('ok');
  });
});

describe('http', () => {
  it('parses JSON and throws on failures', async () => {
    const { getJson } = await import('./http');
    mockFetch(() => ({ a: 1 }));
    expect(await getJson('https://x')).toEqual({ a: 1 });
    mockFetch(() => new Response('{}', { status: 500 }));
    await expect(getJson('https://x')).rejects.toThrow('500');
  });

  it('posts forms and returns the status', async () => {
    const { postForm } = await import('./http');
    const spy = mockFetch(() => new Response('{"ok":true}', { status: 409 }));
    const result = await postForm('https://x', { a: '1' });
    expect(result).toEqual({ ok: false, status: 409, body: { ok: true } });
    expect(String((spy.mock.calls[0][1] as RequestInit).body)).toBe('a=1');
  });
});

describe('lbry rpc', () => {
  it('sends JSON-RPC calls and returns the result', async () => {
    const { lbryRpc } = await import('./lbry');
    const spy = mockFetch(() => rpcResult({ items: [] }));
    expect(await lbryRpc('claim_search', { page: 1 })).toEqual({ items: [] });
    expect(spy.mock.calls[0][0]).toContain('?m=claim_search');
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).params).toEqual({ page: 1 });
  });

  it('throws API errors and sends the token on authenticated calls', async () => {
    const { lbryRpc, lbryRpcAuthenticated } = await import('./lbry');
    mockFetch(() => ({ error: { message: 'boom' } }));
    await expect(lbryRpc('x', {})).rejects.toThrow('boom');
    mockFetch(() => ({ error: {} }));
    await expect(lbryRpc('x', {})).rejects.toThrow('LBRY API error');
    const spy = mockFetch(() => rpcResult(1));
    await lbryRpcAuthenticated('preference_get', {}, 'tok');
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Lbry-Auth-Token': 'tok' });
  });
});

describe('timeouts and retries', () => {
  const hang = () => vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    const { getJson, postForm } = await import('./http');
    vi.stubGlobal('fetch', hang());
    const json = expect(getJson('https://x')).rejects.toThrow('aborted');
    const form = expect(postForm('https://x', { a: '1' })).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(20000);
    await json;
    await form;
  });

  it('reads one more time after a network failure, but not after an answer from the API', async () => {
    vi.useFakeTimers();
    const { lbryRpc } = await import('./lbry');
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network');
      return jsonResponse(rpcResult({ ok: 1 }));
    }));
    const retried = lbryRpc('claim_search', {});
    await vi.advanceTimersByTimeAsync(700);
    expect(await retried).toEqual({ ok: 1 });
    expect(calls).toBe(2);
    mockFetch(() => ({ error: { message: 'refused' } }));
    await expect(lbryRpc('claim_search', {})).rejects.toThrow('refused');
  });

  it('does not let hung requests block the ones behind them', async () => {
    vi.useFakeTimers();
    const { lbryRpc } = await import('./lbry');
    const stuck = hang();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls += 1;
      if (calls <= 4) return stuck(url, init);
      return jsonResponse(rpcResult({ fifth: true }));
    }));
    const first = Array.from({ length: 4 }, () => lbryRpc('claim_search', {}).catch((error: Error) => error.message));
    const fifth = lbryRpc('claim_search', {});
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(4);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await fifth).toEqual({ fifth: true });
    expect(await Promise.all(first)).toEqual(['aborted', 'aborted', 'aborted', 'aborted']);
  });

  it('does not read again after a timeout or an answer that is not JSON, which would only load a busy server more', async () => {
    vi.useFakeTimers();
    const { lbryRpc } = await import('./lbry');
    const stuck = hang();
    const spy = vi.fn((url: string, init?: RequestInit) => stuck(url, init));
    vi.stubGlobal('fetch', spy);
    const timedOut = expect(lbryRpc('claim_search', {})).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(16000);
    await timedOut;
    expect(spy).toHaveBeenCalledTimes(1);
    const html = vi.fn(async () => new Response('<html>busy</html>', { status: 503 }));
    vi.stubGlobal('fetch', html);
    await expect(lbryRpc('claim_search', {})).rejects.toThrow();
    expect(html).toHaveBeenCalledTimes(1);
  });
});
