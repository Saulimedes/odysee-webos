import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridNav } from './gridNav';
import { PRIORITY, useKeys } from './keys';
import { isTextField } from './textField';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });

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

  it('does not move right past the last column or item', () => {
    const onIndex = vi.fn();
    render(<Grid start={2} onIndex={onIndex} />);
    press(39);
    expect(onIndex).not.toHaveBeenCalled();
  });
});
