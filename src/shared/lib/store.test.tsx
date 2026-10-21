import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';
import { useRemembered } from './remember';
import { useDebounced } from './hooks';

describe('createStore', () => {
  it('notifies subscribers and skips identical values', () => {
    const store = createStore(1);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set(2);
    store.set(2);
    store.set((value) => value + 1);
    expect(store.get()).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.set(4);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('re-renders hook users', () => {
    const store = createStore('a');
    function View() { return <span>{store.use()}</span>; }
    render(<View />);
    act(() => store.set('b'));
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});

describe('useRemembered', () => {
  function View({ id }: { id: string }) {
    const [value, setValue] = useRemembered(`test:${id}`, 0);
    return <button onClick={() => setValue((previous) => previous + 1)}>{value}</button>;
  }

  it('keeps state across unmounts', () => {
    const first = render(<View id="one" />);
    act(() => screen.getByRole('button').click());
    act(() => screen.getByRole('button').click());
    first.unmount();
    render(<View id="one" />);
    expect(screen.getByRole('button')).toHaveTextContent('2');
  });
});

describe('useDebounced', () => {
  it('delays updates', () => {
    vi.useFakeTimers();
    function View({ value }: { value: string }) { return <span>{useDebounced(value, 500)}</span>; }
    const { rerender } = render(<View value="a" />);
    rerender(<View value="b" />);
    expect(screen.getByText('a')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
