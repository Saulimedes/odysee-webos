import { vi } from 'vitest';

export type Handler = (url: string, init?: RequestInit) => unknown;

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function mockFetch(handler: Handler) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = handler(String(input), init);
    if (result instanceof Response) return result;
    return jsonResponse(result);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export function cssRules(css: string, selector: string): Array<Record<string, string>> {
  const rules: Array<Record<string, string>> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match = pattern.exec(text);
  while (match) {
    if (match[1].split(',').some((entry) => entry.replace(/\s+/g, ' ').trim() === selector)) {
      const declarations: Record<string, string> = {};
      match[2].split(';').forEach((line) => {
        const at = line.indexOf(':');
        if (at > 0) declarations[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      });
      rules.push(declarations);
    }
    match = pattern.exec(text);
  }
  return rules;
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export const rpcResult = (result: unknown) => ({ jsonrpc: '2.0', result, id: 1 });

export function claim(id: string, title = `Video ${id}`, extra: Record<string, unknown> = {}) {
  return {
    claim_id: id,
    name: `name-${id}`,
    timestamp: 1700000000,
    value: { title, release_time: '1700000100', thumbnail: { url: 'https://thumbs.odycdn.com/a.webp' }, video: { duration: 120, height: 720 }, source: { hash: 'abcdef123456' } },
    signing_channel: { claim_id: 'chan', name: '@chan', value: { title: 'Channel', thumbnail: { url: 'https://thumbs.odycdn.com/c.webp' } } },
    ...extra,
  };
}

export const video = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Video ${id}`,
  thumb: 'https://thumbs.odycdn.com/a.webp',
  duration: 600,
  height: 720,
  releaseTime: 1700000000,
  channelId: 'chan',
  channelName: 'chan',
  channelTitle: 'Channel',
  channelThumb: 'https://thumbs.odycdn.com/c.webp',
  claimName: `name-${id}`,
  hash: 'abcdef123456',
  ...extra,
});

export function bodyOf(init?: RequestInit): { method?: string; params: Record<string, any> } {
  try { return { params: {}, ...JSON.parse(String(init?.body)) }; } catch { return { params: {} }; }
}
