import { useCallback, useState } from 'react';

const memory = new Map<string, unknown>();

export function useRemembered<T>(key: string, initial: T): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const set = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      memory.set(key, resolved);
      return resolved;
    });
  }, [key]);
  return [value, set];
}

/** @public */
export function forgetRemembered(prefix = '') {
  Array.from(memory.keys()).filter((key) => key.startsWith(prefix)).forEach((key) => memory.delete(key));
}
