import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WheelNavigation } from '../../../tests/render';
import { useKeys } from './keys';
import { isPointerDriven, pointerMoved } from './pointer';

function Keys() {
  useKeys(() => false);
  return null;
}

const move = (x: number, y = 0) => {
  const native = new MouseEvent('mousemove', { clientX: x, clientY: y });
  return { native, event: { nativeEvent: native, clientX: x, clientY: y } };
};

describe('pointerMoved', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts the first move and a real move, and ignores the shake of a hand', () => {
    expect(isPointerDriven()).toBe(false);
    expect(pointerMoved(move(100).event)).toBe(true);
    expect(isPointerDriven()).toBe(true);
    expect(pointerMoved(move(103, 4).event)).toBe(false);
    expect(pointerMoved(move(107, 6).event)).toBe(false);
    expect(pointerMoved(move(130).event)).toBe(true);
    expect(pointerMoved(move(133).event)).toBe(false);
  });

  it('gives every handler of one event the same answer', () => {
    const { event } = move(400);
    expect(pointerMoved(event)).toBe(true);
    expect(pointerMoved(event)).toBe(true);
    const shake = move(402);
    expect(pointerMoved(shake.event)).toBe(false);
    expect(pointerMoved(shake.event)).toBe(false);
  });

  it('follows the cursor everywhere, also where no handler asks about it', () => {
    expect(pointerMoved(move(1000).event)).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 1300, clientY: 400, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 1600, clientY: 700, bubbles: true }));
    expect(pointerMoved(move(1604, 702).event)).toBe(false);
    expect(pointerMoved(move(1700, 702).event)).toBe(true);
  });

  it('lets go before any key handler runs, so the screen that follows the key sees the keys in charge', () => {
    let seen: boolean | null = null;
    function Probe() {
      useKeys(() => { seen = isPointerDriven(); return false; });
      return null;
    }
    render(<Probe />);
    expect(pointerMoved(move(2000).event)).toBe(true);
    expect(isPointerDriven()).toBe(true);
    fireEvent.keyDown(window, { keyCode: 40 });
    expect(seen).toBe(false);
  });

  it('hands the selection back to the keys, and wants a bigger move right after one', () => {
    render(<Keys />);
    expect(pointerMoved(move(700).event)).toBe(true);
    expect(isPointerDriven()).toBe(true);
    fireEvent.keyDown(window, { keyCode: 39 });
    expect(isPointerDriven()).toBe(false);
    expect(pointerMoved(move(725).event)).toBe(false);
    vi.advanceTimersByTime(450);
    expect(pointerMoved(move(745).event)).toBe(true);
    expect(isPointerDriven()).toBe(true);
  });
});

describe('the wheel of the remote', () => {
  const keys: number[] = [];
  const record = (event: KeyboardEvent) => { keys.push(event.keyCode); };
  beforeEach(() => {
    keys.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    window.addEventListener('keydown', record);
  });
  afterEach(() => { window.removeEventListener('keydown', record); vi.useRealTimers(); });

  it('works as the Down and Up keys, one step at a time', () => {
    render(<WheelNavigation />);
    expect(fireEvent.wheel(document.body, { deltaY: 100 })).toBe(false);
    expect(keys).toEqual([40]);
    fireEvent.wheel(document.body, { deltaY: -100 });
    expect(keys).toEqual([40]);
    vi.advanceTimersByTime(130);
    fireEvent.wheel(document.body, { deltaY: -100 });
    expect(keys).toEqual([40, 38]);
  });

  it('ignores a wheel that does not move, a text field and the player', () => {
    render(
      <>
        <WheelNavigation />
        <input data-testid="field" />
        <div className="player"><span data-testid="video" /></div>
        <div className="player"><div className="picker"><span data-testid="menu" /></div></div>
      </>,
    );
    const wheel = (target: Element) => { vi.advanceTimersByTime(130); return fireEvent.wheel(target, { deltaY: 100 }); };
    expect(wheel(document.body)).toBe(false);
    expect(keys).toEqual([40]);
    fireEvent.wheel(document.body, { deltaY: 0 });
    expect(wheel(document.querySelector('[data-testid=field]') as Element)).toBe(true);
    expect(wheel(document.querySelector('[data-testid=video]') as Element)).toBe(true);
    expect(keys).toEqual([40]);
    expect(wheel(document.querySelector('[data-testid=menu]') as Element)).toBe(false);
    expect(keys).toEqual([40, 40]);
  });

  it('stops listening when the app goes away', () => {
    const view = render(<WheelNavigation />);
    view.unmount();
    fireEvent.wheel(document.body, { deltaY: 100 });
    expect(keys).toEqual([]);
  });
});
