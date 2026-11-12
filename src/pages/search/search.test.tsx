import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, claim, flush, jsonResponse, mockFetch, rpcResult } from '../../../tests/helpers';
import { hoverOver, renderWithNav, setViewport } from '../../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { SearchPage } from './ui/SearchPage';
import { searchChannelPage, searchVideoPage } from './api/search';
import { DEFAULT_FILTERS, filterParams, filtersKey, isFiltered } from './model/filters';

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

describe('search filters', () => {
  const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
  const lighthouseUrls = (spy: ReturnType<typeof mockFetch>) => spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('lighthouse'));
  const button = () => document.querySelector('.searchInput__filters') as HTMLElement | null;
  const entries = () => Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent);

  function setup() {
    const spy = mockFetch((url, init) => {
      if (url.includes('lighthouse')) return [{ claimId: 'y1' }];
      return rpcResult({ items: bodyOf(init).params.claim_ids.map((id: string) => claim(id, `Result ${id}`)) });
    });
    const view = renderWithNav(<SearchPage />);
    return { spy, ...view };
  }

  it('translates the filters into what Lighthouse understands', () => {
    expect(filterParams(DEFAULT_FILTERS)).toEqual({});
    expect(filterParams({ sort: 'newest', time: 'week', length: 'short' })).toEqual({ sort_by: 'release_time', time_filter: 'thisweek', max_duration: '240' });
    expect(filterParams({ sort: 'relevance', time: 'today', length: 'long' })).toEqual({ time_filter: 'today', min_duration: '1200' });
    expect(filterParams({ sort: 'relevance', time: 'month', length: 'any' })).toEqual({ time_filter: 'thismonth' });
    expect(filterParams({ sort: 'relevance', time: 'year', length: 'any' })).toEqual({ time_filter: 'thisyear' });
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, time: 'today' })).toBe(true);
    expect(filtersKey({ sort: 'newest', time: 'any', length: 'long' })).toBe('newest:any:long');
  });

  it('sends the filters with the video search, and none by default', async () => {
    const spy = mockFetch((url, init) => (url.includes('lighthouse') ? [{ claimId: 'a' }] : rpcResult({ items: bodyOf(init).params.claim_ids.map((id: string) => claim(id)) })));
    await searchVideoPage('words', 0);
    await searchVideoPage('words', 0, () => true, { sort: 'newest', time: 'today', length: 'long' });
    const [plain, filtered] = lighthouseUrls(spy).map((url) => new URL(url).searchParams);
    expect(plain.has('sort_by') || plain.has('time_filter') || plain.has('min_duration')).toBe(false);
    expect(filtered.get('sort_by')).toBe('release_time');
    expect(filtered.get('time_filter')).toBe('today');
    expect(filtered.get('min_duration')).toBe('1200');
    expect(filtered.get('claimType')).toBe('file');
  });

  it('opens from the end of the search field, searches again with the choice, and shows that a filter is on', async () => {
    const { spy } = setup();
    typeInto('fixture');
    await screen.findByText('Result y1', {}, { timeout: 3000 });
    expect(button()?.className).not.toContain('--on');
    press(39);
    expect(button()?.className).toContain('--active');
    expect(document.querySelector('.searchInput--active')).toBeNull();
    press(13);
    expect(screen.getByText('Filters', { selector: 'h2' })).toBeInTheDocument();
    expect(entries()).toEqual(['Sort byRelevance', 'UploadedAny time', 'LengthAny length']);
    press(13);
    expect(screen.getByText('Sort by', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(13);
    expect(document.querySelector('.picker')).toBeNull();
    await waitFor(() => expect(lighthouseUrls(spy).some((url) => url.includes('sort_by=release_time'))).toBe(true));
    expect(button()?.className).toContain('--on');
    expect(button()?.className).toContain('--active');
    await screen.findByText('Result y1');
  });

  it('closes the whole filter menu with a click outside it, from the list and from a choice', async () => {
    setup();
    typeInto('fixture');
    await screen.findByText('Result y1', {}, { timeout: 3000 });
    press(39);
    press(13);
    expect(screen.getByText('Filters', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(document.querySelector('.picker')).toBeNull();
    press(13);
    press(13);
    expect(screen.getByText('Sort by', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(document.querySelector('.picker')).toBeNull();
    expect(button()?.className).not.toContain('--on');
  });

  it('chooses the other filters, goes back from a choice, and resets them', async () => {
    const { spy } = setup();
    typeInto('fixture');
    await screen.findByText('Result y1', {}, { timeout: 3000 });
    press(39);
    press(13);
    press(40);
    press(13);
    press(40); press(40);
    press(13);
    await waitFor(() => expect(lighthouseUrls(spy).some((url) => url.includes('time_filter=thisweek'))).toBe(true));
    press(13);
    expect(entries()).toEqual(['Sort byRelevance', 'UploadedThis week', 'LengthAny length', 'Reset filters']);
    press(40); press(40);
    press(13);
    press(461);
    expect(screen.getByText('Filters', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(13);
    await waitFor(() => expect(button()?.className).not.toContain('--on'));
    expect(document.querySelector('.picker')).toBeNull();
  });

  it('moves between the field, the button and the tabs, and leaves the menu with Back', async () => {
    setup();
    typeInto('fix');
    press(39);
    expect(button()?.className).toContain('--active');
    press(38);
    press(39);
    expect(button()?.className).toContain('--active');
    press(37);
    expect(document.querySelector('.searchInput--active')).not.toBeNull();
    press(39);
    press(40);
    expect(document.querySelector('.tabs--active')).not.toBeNull();
    press(38);
    press(39);
    press(13);
    press(461);
    expect(document.querySelector('.picker')).toBeNull();
  });

  it('keeps Right inside the text while the caret is not at the end, and has no button for channels', async () => {
    setup();
    typeInto('fixture');
    const input = screen.getByPlaceholderText('Search Odysee...') as HTMLInputElement;
    input.setSelectionRange(2, 2);
    press(39);
    expect(button()?.className).not.toContain('--active');
    expect(button()).not.toBeNull();
    press(40);
    press(39);
    expect(button()).toBeNull();
    press(38);
    press(39);
    expect(document.querySelector('.searchInput__filters--active')).toBeNull();
  });

  it('opens with a click and when the cursor moves onto it', async () => {
    setup();
    hoverOver(button() as HTMLElement);
    expect(button()?.className).toContain('--active');
    fireEvent.click(button() as HTMLElement);
    expect(screen.getByText('Filters', { selector: 'h2' })).toBeInTheDocument();
  });
});
