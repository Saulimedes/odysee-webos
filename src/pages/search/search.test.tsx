import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, jsonResponse, mockFetch, rpcResult } from '../../../tests/helpers';
import { hoverOver, renderWithNav, setViewport } from '../../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { SearchPage } from './ui/SearchPage';
import { searchChannelPage, searchVideoPage } from './api/search';

const typeInto = (text: string) => fireEvent.change(screen.getByPlaceholderText('Search Odysee...'), { target: { value: text } });

beforeEach(() => {
  setViewport();
  invalidate();
  forgetRemembered();
});

function controlled() {
  const lighthouse: Array<{ text: string; kind: string | null; answer: (ids: string[]) => void }> = [];
  const claimSearches: Array<Record<string, any>> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('lighthouse')) {
      const params = new URL(url).searchParams;
      const ids = await new Promise<string[]>((answer) => { lighthouse.push({ text: params.get('s') as string, kind: params.get('claimType'), answer }); });
      return jsonResponse(ids.map((claimId) => ({ claimId })));
    }
    const params = JSON.parse(String(init?.body)).params;
    claimSearches.push(params);
    if (params.claim_type?.[0] === 'channel') return jsonResponse(rpcResult({ items: params.claim_ids.map((id: string) => ({ claim_id: id, name: `@${id}`, value: { title: `Chan ${id}` } })) }));
    return jsonResponse(rpcResult({ items: params.claim_ids.map((id: string) => claim(id, `Result ${id}`)) }));
  }));
  return { lighthouse, claimSearches };
}

describe('search with the cursor', () => {
  it('hands the focus to the tabs and the results as the cursor moves over them', async () => {
    const { lighthouse } = controlled();
    renderWithNav(<SearchPage />);
    typeInto('fixture');
    await waitFor(() => expect(lighthouse).toHaveLength(1), { timeout: 2000 });
    await act(async () => { lighthouse[0].answer(['y1', 'y2']); });
    await screen.findByText('Result y1');
    expect(document.querySelector('.searchInput--active')).not.toBeNull();
    hoverOver(document.querySelector('.tabs') as Element);
    expect(document.querySelector('.tabs--active')).not.toBeNull();
    expect(document.querySelector('.searchInput--active')).toBeNull();
    hoverOver(screen.getByText('Result y2').closest('.card') as Element);
    expect(document.querySelector('.tabs--active')).toBeNull();
    expect(document.querySelector('.card--active')?.textContent).toContain('Result y2');
    fireEvent.keyDown(window, { keyCode: 38 });
    expect(document.querySelector('.tabs--active')).not.toBeNull();
  });

  it('keeps the focus in the search field while there is nothing to point at', () => {
    renderWithNav(<SearchPage />);
    hoverOver(document.querySelector('.searchResults') as Element);
    expect(document.querySelector('.searchInput--active')).not.toBeNull();
  });
});

describe('search flow', () => {
  it('does not fetch the claims of a search whose text has moved on while Lighthouse was answering', async () => {
    const { lighthouse, claimSearches } = controlled();
    renderWithNav(<SearchPage />);
    typeInto('first words');
    await waitFor(() => expect(lighthouse).toHaveLength(1), { timeout: 2000 });
    typeInto('second words');
    await waitFor(() => expect(lighthouse).toHaveLength(2), { timeout: 2000 });
    await act(async () => { lighthouse[0].answer(['x1', 'x2']); });
    await flush();
    expect(claimSearches).toHaveLength(0);
    await act(async () => { lighthouse[1].answer(['y1', 'y2']); });
    expect(await screen.findByText('Result y1')).toBeInTheDocument();
    expect(claimSearches).toHaveLength(1);
    expect(claimSearches[0].claim_ids).toEqual(['y1', 'y2']);
    expect(screen.queryByText('Result x1')).toBeNull();
  });

  it('asks for the claims as soon as Lighthouse has answered, and shows them', async () => {
    const { lighthouse, claimSearches } = controlled();
    renderWithNav(<SearchPage />);
    typeInto('fixture');
    await waitFor(() => expect(lighthouse).toHaveLength(1), { timeout: 2000 });
    expect(claimSearches).toHaveLength(0);
    await act(async () => { lighthouse[0].answer(['r1']); });
    expect(await screen.findByText('Result r1')).toBeInTheDocument();
    expect(claimSearches).toHaveLength(1);
  });

  it('starts a search 300 ms after the last key', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const spy = mockFetch((url) => (url.includes('lighthouse') ? [] : rpcResult({ items: [] })));
      renderWithNav(<SearchPage />);
      const lighthouseCalls = () => spy.mock.calls.filter(([url]) => String(url).includes('lighthouse')).length;
      typeInto('fixture');
      act(() => { vi.advanceTimersByTime(299); });
      expect(lighthouseCalls()).toBe(0);
      typeInto('fixtures');
      act(() => { vi.advanceTimersByTime(299); });
      expect(lighthouseCalls()).toBe(0);
      act(() => { vi.advanceTimersByTime(1); });
      expect(lighthouseCalls()).toBe(1);
      expect(String(spy.mock.calls[0][0])).toContain('s=fixtures');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('search api', () => {
  function lighthouseAndClaims() {
    return mockFetch((url, init) => {
      if (url.includes('lighthouse')) return [{ claimId: 'a' }, { claimId: 'b' }];
      const params = JSON.parse(String(init?.body)).params;
      return rpcResult({ items: params.claim_ids.map((id: string) => (params.claim_type?.[0] === 'channel' ? { claim_id: id, name: `@${id}`, value: { title: id } } : claim(id))) });
    });
  }

  it('resolves the hits of Lighthouse into videos and channels', async () => {
    lighthouseAndClaims();
    expect((await searchVideoPage('words', 0)).items.map((video) => video.id)).toEqual(['a', 'b']);
    expect((await searchChannelPage('words', 0)).items.map((channel) => channel.id)).toEqual(['a', 'b']);
    expect((await searchVideoPage('words', 0)).count).toBe(2);
  });

  it('does not resolve the hits when the search is outdated by the time Lighthouse answers', async () => {
    const spy = lighthouseAndClaims();
    let current = true;
    const pending = searchVideoPage('stale words', 0, () => current);
    current = false;
    expect(await pending).toEqual({ items: [], count: 0 });
    const channels = await searchChannelPage('stale words', 0, () => false);
    expect(channels).toEqual({ items: [], count: 0 });
    const claimSearches = spy.mock.calls.filter(([url]) => !String(url).includes('lighthouse'));
    expect(claimSearches).toHaveLength(0);
  });
});
