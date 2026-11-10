import { useEffect, useRef } from 'react';
import { releasePointer } from './pointer';

type Handler = (event: KeyboardEvent) => boolean | void;
interface Layer { priority: number; order: number; handler: Handler }

const layers = new Set<Layer>();
let counter = 0;
let attached = false;

function dispatch(event: KeyboardEvent) {
  // React renders right after the first handler, so the pointer is released before any handler runs
  releasePointer();
  const sorted = Array.from(layers).sort((a, b) => b.priority - a.priority || b.order - a.order);
  for (const layer of sorted) {
    if (layer.handler(event) === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}

function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', dispatch, true);
}

export const PRIORITY = { content: 10, sidebar: 20, overlay: 30, player: 40 } as const;

export function useKeys(handler: Handler, { enabled = true, priority = PRIORITY.content }: { enabled?: boolean; priority?: number } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    attach();
    const layer: Layer = { priority, order: ++counter, handler: (event) => handlerRef.current(event) };
    layers.add(layer);
    return () => { layers.delete(layer); };
  }, [enabled, priority]);
}
