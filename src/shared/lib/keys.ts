import { useEffect, useRef } from 'react';
import { KEY } from '@/shared/config';
import { releasePointer } from './pointer';

type Handler = (event: KeyboardEvent) => boolean | void;
interface Layer { priority: number; order: number; handler: Handler; onKeyUp?: Handler }

const layers = new Set<Layer>();
let counter = 0;
let attached = false;
let enterDown = false;

export const isEnterHeld = () => enterDown;

const byRank = (a: Layer, b: Layer) => b.priority - a.priority || b.order - a.order;

function dispatch(event: KeyboardEvent) {
  if (event.keyCode === KEY.ENTER) enterDown = true;
  // React renders right after the first handler, so the pointer is released before any handler runs
  releasePointer();
  for (const layer of Array.from(layers).sort(byRank)) {
    if (layer.handler(event) === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}

function dispatchUp(event: KeyboardEvent) {
  if (event.keyCode === KEY.ENTER) enterDown = false;
  for (const layer of Array.from(layers).sort(byRank)) {
    if (layer.onKeyUp && layer.onKeyUp(event) === true) {
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
  window.addEventListener('keyup', dispatchUp, true);
  window.addEventListener('blur', () => { enterDown = false; });
}

export const PRIORITY = { content: 10, sidebar: 20, overlay: 30, player: 40 } as const;

interface KeyOptions { enabled?: boolean; priority?: number; onKeyUp?: Handler }

export function useKeys(handler: Handler, { enabled = true, priority = PRIORITY.content, onKeyUp }: KeyOptions = {}) {
  const handlerRef = useRef(handler);
  const upRef = useRef(onKeyUp);
  handlerRef.current = handler;
  upRef.current = onKeyUp;
  const listensUp = onKeyUp !== undefined;

  useEffect(() => {
    if (!enabled) return undefined;
    attach();
    const layer: Layer = {
      priority,
      order: ++counter,
      handler: (event) => handlerRef.current(event),
      onKeyUp: listensUp ? (event) => upRef.current?.(event) : undefined,
    };
    layers.add(layer);
    return () => { layers.delete(layer); };
  }, [enabled, priority, listensUp]);
}
