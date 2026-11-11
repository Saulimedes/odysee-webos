import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridNav } from './gridNav';
import { PRIORITY, isEnterHeld, useKeys } from './keys';
import { HOLD_MS, useOkPress } from './okPress';
import { isTextField } from './textField';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };

function Layer({ priority, handler, enabled = true }: { priority: number; handler: (event: KeyboardEvent) => boolean | void; enabled?: boolean }) {
  useKeys(handler, { priority, enabled });
  return null;
}

describe('useKeys', () => {
  it('lets the highest priority layer consume the key', () => {
    const low = vi.fn(() => true);
    const high = vi.fn(() => true);
    render(<><Layer priority={PRIORITY.content} handler={low} /><Layer priority={PRIORITY.overlay} handler={high} /></>);
    press(13);
    expect(high).toHaveBeenCalledTimes(1);
    expect(low).not.toHaveBeenCalled();
  });

  it('falls through when a layer does not handle the key', () => {
    const low = vi.fn(() => true);
    const high = vi.fn(() => false);
    render(<><Layer priority={PRIORITY.content} handler={low} /><Layer priority={PRIORITY.sidebar} handler={high} /></>);
    press(13);
    expect(high).toHaveBeenCalled();
    expect(low).toHaveBeenCalled();
  });

  it('prefers the most recent layer at equal priority and ignores disabled layers', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const off = vi.fn(() => true);
    render(<><Layer priority={10} handler={first} /><Layer priority={10} handler={second} /><Layer priority={99} handler={off} enabled={false} /></>);
    press(13);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(off).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const handler = vi.fn(() => true);
    const { unmount } = render(<Layer priority={10} handler={handler} />);
    unmount();
    press(13);
    expect(handler).not.toHaveBeenCalled();
  });

  it('detects text fields', () => {
    expect(isTextField(document.createElement('input'))).toBe(true);
    expect(isTextField(document.createElement('div'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('useGridNav', () => {
  function Grid({ start, count = 7, columns = 3, ...handlers }: { start: number; count?: number; columns?: number; onLeftEdge?: () => void; onTopEdge?: () => void; onNearEnd?: () => void; onSelect?: (index: number) => void; onIndex?: (index: number) => void }) {
    useGridNav({
      count, columns, index: start,
      setIndex: (next) => handlers.onIndex?.(next),
      onSelect: (at) => handlers.onSelect?.(at),
      onLeftEdge: handlers.onLeftEdge, onTopEdge: handlers.onTopEdge, onNearEnd: handlers.onNearEnd,
    });
    return null;
  }

  it('moves by columns and rows', () => {
    const onIndex = vi.fn();
    render(<Grid start={4} onIndex={onIndex} />);
    press(38); expect(onIndex).toHaveBeenLastCalledWith(1);
    press(40); expect(onIndex).toHaveBeenLastCalledWith(7 - 1);
    press(37); expect(onIndex).toHaveBeenLastCalledWith(3);
    press(39); expect(onIndex).toHaveBeenLastCalledWith(5);
  });

  it('jumps to the last item when the next row is short', () => {
    const onIndex = vi.fn();
    render(<Grid start={5} onIndex={onIndex} />);
    press(40);
    expect(onIndex).toHaveBeenCalledWith(6);
  });

  it('reports edges and near the end', () => {
    const onLeftEdge = vi.fn();
    const onTopEdge = vi.fn();
    const onNearEnd = vi.fn();
    const onSelect = vi.fn();
    render(<Grid start={0} onLeftEdge={onLeftEdge} onTopEdge={onTopEdge} onNearEnd={onNearEnd} onSelect={onSelect} />);
    press(37); expect(onLeftEdge).toHaveBeenCalled();
    press(38); expect(onTopEdge).toHaveBeenCalled();
    press(40); expect(onNearEnd).toHaveBeenCalled();
    press(13); expect(onSelect).toHaveBeenCalledWith(0);
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('selects once per press, not for every repeat of a held key', () => {
    const onSelect = vi.fn();
    render(<Grid start={2} onSelect={onSelect} />);
    fireEvent.keyDown(window, { keyCode: 13 });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not move right past the last column or item', () => {
    const onIndex = vi.fn();
    render(<Grid start={2} onIndex={onIndex} />);
    press(39);
    expect(onIndex).not.toHaveBeenCalled();
  });
});

describe('key release', () => {
  const release = (keyCode: number) => fireEvent.keyUp(window, { keyCode });

  function Listener({ priority, onKeyUp, enabled = true }: { priority: number; onKeyUp: (event: KeyboardEvent) => boolean | void; enabled?: boolean }) {
    useKeys(() => false, { priority, enabled, onKeyUp });
    return null;
  }

  it('offers the release to the layers that ask for it, highest priority first', () => {
    const low = vi.fn(() => true);
    const high = vi.fn(() => true);
    render(<><Listener priority={PRIORITY.content} onKeyUp={low} /><Listener priority={PRIORITY.overlay} onKeyUp={high} /></>);
    release(13);
    expect(high).toHaveBeenCalledTimes(1);
    expect(low).not.toHaveBeenCalled();
  });

  it('falls through when a layer lets the release pass, and skips layers that do not ask', () => {
    const low = vi.fn(() => true);
    const high = vi.fn(() => false);
    const quiet = vi.fn(() => true);
    render(<><Listener priority={PRIORITY.content} onKeyUp={low} /><Listener priority={PRIORITY.sidebar} onKeyUp={high} /><Layer priority={PRIORITY.player} handler={quiet} /></>);
    release(13);
    expect(high).toHaveBeenCalled();
    expect(low).toHaveBeenCalled();
    expect(quiet).not.toHaveBeenCalled();
  });

  it('stops listening for releases after unmount or while disabled', () => {
    const handler = vi.fn(() => true);
    const { unmount } = render(<Listener priority={10} onKeyUp={handler} enabled={false} />);
    release(13);
    expect(handler).not.toHaveBeenCalled();
    unmount();
    render(<Listener priority={10} onKeyUp={handler} />).unmount();
    release(13);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useOkPress', () => {
  function Button({ onPress, onHold }: { onPress: () => void; onHold: () => void }) {
    const ok = useOkPress();
    useKeys((event) => {
      if (event.keyCode !== 13) return false;
      ok.down(event, { press: onPress, hold: onHold });
      return true;
    }, { onKeyUp: (event) => { if (event.keyCode !== 13) return false; ok.up(); return true; } });
    return null;
  }
  const down = (repeat = false) => fireEvent.keyDown(window, { keyCode: 13, repeat });
  const up = () => fireEvent.keyUp(window, { keyCode: 13 });

  it('presses on release when the key is let go quickly', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    down();
    expect(onPress).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(HOLD_MS - 50); });
    up();
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onHold).not.toHaveBeenCalled();
  });

  it('holds once the key stays down, and the release after that does not press', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    down();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(onHold).toHaveBeenCalledTimes(1);
    down(true); down(true);
    up();
    expect(onPress).not.toHaveBeenCalled();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('ignores repeated key events while the key is held and a release with nothing pending', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    up();
    down();
    act(() => { vi.advanceTimersByTime(HOLD_MS - 200); });
    down(true);
    act(() => { vi.advanceTimersByTime(100); });
    expect(onHold).toHaveBeenCalledTimes(0);
    act(() => { vi.advanceTimersByTime(200); });
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does nothing when it unmounts while the key is down', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    const { unmount } = render(<Button onPress={onPress} onHold={onHold} />);
    down();
    unmount();
    act(() => { vi.advanceTimersByTime(HOLD_MS * 2); });
    up();
    expect(onHold).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('okPress without repeat flags', () => {
  function Button({ onPress, onHold }: { onPress: () => void; onHold: () => void }) {
    const ok = useOkPress();
    useKeys((event) => {
      if (event.keyCode !== 13) return false;
      ok.down(event, { press: onPress, hold: onHold });
      return true;
    }, { onKeyUp: (event) => { if (event.keyCode !== 13) return false; ok.up(); return true; } });
    return null;
  }
  const down = () => fireEvent.keyDown(window, { keyCode: 13 });
  const up = () => fireEvent.keyUp(window, { keyCode: 13 });

  it('holds once for a TV that sends the repeats of a held OK as plain presses, and does not press on release', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    down();
    for (let step = 0; step < 12; step++) { act(() => { vi.advanceTimersByTime(100); }); down(); }
    expect(onHold).toHaveBeenCalledTimes(1);
    up();
    expect(onPress).not.toHaveBeenCalled();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('starts a new press after a release that never came', () => {
    vi.useFakeTimers();
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    down();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(onHold).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(3000); });
    down();
    up();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('presses on each of two quick taps', () => {
    const [onPress, onHold] = [vi.fn(), vi.fn()];
    render(<Button onPress={onPress} onHold={onHold} />);
    down(); up(); down(); up();
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(onHold).not.toHaveBeenCalled();
  });
});

describe('isEnterHeld', () => {
  function Listener() { useKeys(() => false); return null; }

  it('follows OK from the press to the release, and forgets it when the window loses the focus', () => {
    render(<Listener />);
    expect(isEnterHeld()).toBe(false);
    fireEvent.keyDown(window, { keyCode: 13 });
    expect(isEnterHeld()).toBe(true);
    fireEvent.keyUp(window, { keyCode: 13 });
    expect(isEnterHeld()).toBe(false);
    fireEvent.keyDown(window, { keyCode: 13 });
    fireEvent.keyDown(window, { keyCode: 40 });
    expect(isEnterHeld()).toBe(true);
    fireEvent.blur(window);
    expect(isEnterHeld()).toBe(false);
  });
});
