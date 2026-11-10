import { useCallback, useEffect, useRef, useState } from 'react';
import { SEARCH_PAGE, type SearchPage } from '../api/search';

interface State<T> { items: T[]; from: number; hasMore: boolean }

export function useSearchResults<T extends { id: string }>(key: string | null, fetchPage: (from: number, isCurrent: () => boolean) => Promise<SearchPage<T>>) {
  const [state, setState] = useState<State<T>>({ items: [], from: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef(fetchPage);
  const busy = useRef(false);
  const stateRef = useRef(state);
  const generation = useRef(0);
  fetchRef.current = fetchPage;
  stateRef.current = state;

  const run = useCallback(async (from: number, current: number) => {
    busy.current = true;
    setLoading(true);
    try {
      const page = await fetchRef.current(from, () => current === generation.current);
      if (current !== generation.current) return;
      setState((previous) => {
        const known = new Set((from === 0 ? [] : previous.items).map((item) => item.id));
        const items = [...(from === 0 ? [] : previous.items), ...page.items.filter((item) => !known.has(item.id))];
        return { items, from: from + page.count, hasMore: page.count >= SEARCH_PAGE };
      });
    } catch (error) {
      console.error('Search failed', error);
      if (current === generation.current && from === 0) setState({ items: [], from: 0, hasMore: false });
    } finally {
      if (current === generation.current) { busy.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setLoading(false);
    setState({ items: [], from: 0, hasMore: false });
    if (key) void run(0, generation.current);
  }, [key, run]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!busy.current && current.hasMore) void run(current.from, generation.current);
  }, [run]);

  return { items: state.items, loading: loading && state.items.length === 0, loadingMore: loading && state.items.length > 0, loadMore };
}
