import { describe, expect, it } from 'vitest';
import { cycle } from './cycle';

describe('cycle', () => {
  it('steps inside the list', () => {
    expect(cycle(2, 1, 5)).toBe(3);
    expect(cycle(2, -1, 5)).toBe(1);
  });

  it('goes round from the last entry to the first and back', () => {
    expect(cycle(4, 1, 5)).toBe(0);
    expect(cycle(0, -1, 5)).toBe(4);
  });

  it('copes with steps longer than the list and with a single entry', () => {
    expect(cycle(1, 7, 5)).toBe(3);
    expect(cycle(1, -7, 5)).toBe(4);
    expect(cycle(0, 1, 1)).toBe(0);
    expect(cycle(0, -1, 1)).toBe(0);
  });

  it('stays at the start for an empty list', () => {
    expect(cycle(0, 1, 0)).toBe(0);
    expect(cycle(3, -1, 0)).toBe(0);
  });
});
