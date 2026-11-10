import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Thumb } from './Thumb';

const sets = vi.hoisted(() => ({ played: 0, reset: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = ((initial: unknown) => {
    const [value, set] = actual.useState(initial);
    if (initial !== false) return [value, set];
    return [value, (next: unknown) => {
      if (next === true) sets.played++;
      else sets.reset++;
      return (set as (next: unknown) => void)(next);
    }];
  }) as typeof actual.useState;
  return { ...actual, useState };
});

const MOVING = 'https://thumbs.odycdn.com/a.webp';

beforeEach(() => { sets.played = 0; sets.reset = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('Thumb state updates', () => {
  it('sets nothing while the focus moves across a card faster than it plays', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Thumb src={MOVING} width={400} focused={false} />);
    for (let move = 0; move < 5; move++) {
      rerender(<Thumb src={MOVING} width={400} focused />);
      act(() => { vi.advanceTimersByTime(100); });
      rerender(<Thumb src={MOVING} width={400} focused={false} />);
    }
    expect(sets).toEqual({ played: 0, reset: 0 });
  });

  it('sets the state once when the card starts to play and once when it stops', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Thumb src={MOVING} width={400} focused />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(sets).toEqual({ played: 1, reset: 0 });
    rerender(<Thumb src={MOVING} width={400} focused={false} />);
    expect(sets).toEqual({ played: 1, reset: 1 });
  });

  it('stops playing when the picture changes under a focused card', () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<Thumb src={MOVING} width={400} focused />);
    act(() => { vi.advanceTimersByTime(300); });
    expect((container.querySelector('img') as HTMLImageElement).src).toContain('/optimize/');
    rerender(<Thumb src="https://thumbs.odycdn.com/b.webp" width={400} focused />);
    expect((container.querySelector('img') as HTMLImageElement).src).toContain('/card/');
    act(() => { vi.advanceTimersByTime(300); });
    expect((container.querySelector('img') as HTMLImageElement).src).toContain('/optimize/');
  });

  it('never sets the state for a card without a moving picture', () => {
    vi.useFakeTimers();
    render(<Thumb src="https://spee.ch/a.png" width={400} focused />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(sets).toEqual({ played: 0, reset: 0 });
  });
});
