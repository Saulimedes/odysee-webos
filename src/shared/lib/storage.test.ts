import { describe, expect, it, vi } from 'vitest';
import { readJson, removeKey, writeJson } from './storage';

describe('storage helpers', () => {
  it('round trips JSON', () => {
    expect(writeJson('k', { a: 1 })).toBe(true);
    expect(readJson('k', null)).toEqual({ a: 1 });
  });
  it('falls back for missing and malformed values', () => {
    expect(readJson('missing', 5)).toBe(5);
    localStorage.setItem('bad', '{');
    expect(readJson('bad', 7)).toBe(7);
  });
  it('removes keys', () => {
    writeJson('k', 1);
    removeKey('k');
    expect(localStorage.getItem('k')).toBeNull();
  });
  it('reports write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeJson('k', 1)).toBe(false);
  });
  it('ignores removal failures', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => removeKey('k')).not.toThrow();
  });
});
