import { useSyncExternalStore } from 'react';

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const set = (next: T | ((previous: T) => T)) => {
    const value = typeof next === 'function' ? (next as (previous: T) => T)(state) : next;
    if (Object.is(value, state)) return;
    state = value;
    listeners.forEach((listener) => listener());
  };
  return { get, set, subscribe, use: () => useSyncExternalStore(subscribe, get) };
}
