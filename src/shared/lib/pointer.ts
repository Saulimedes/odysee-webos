import { useEffect } from 'react';
import { KEY } from '@/shared/config';
import { isTextField } from './textField';

const WHEEL_STEP_MS = 120;
// The Magic Remote moves the cursor a few pixels while a key is pressed
const JITTER_PX = 10;
const KEY_QUIET_MS = 400;
const KEY_QUIET_PX = 40;

let lastX = -1;
let lastY = -1;
let anchorX = -1;
let anchorY = -1;
let lastKeyAt = -Infinity;
let lastEvent: Event | null = null;
let lastMoved = false;
let pointerDriven = false;

export function releasePointer() {
  pointerDriven = false;
  anchorX = lastX;
  anchorY = lastY;
  lastKeyAt = Date.now();
}

export const isPointerDriven = () => pointerDriven;

function track(native: MouseEvent) {
  if (native === lastEvent) return lastMoved;
  lastEvent = native;
  const limit = Date.now() - lastKeyAt < KEY_QUIET_MS ? KEY_QUIET_PX : JITTER_PX;
  lastMoved = anchorX < 0 || Math.hypot(native.clientX - anchorX, native.clientY - anchorY) >= limit;
  lastX = native.clientX;
  lastY = native.clientY;
  if (lastMoved) {
    anchorX = lastX;
    anchorY = lastY;
    pointerDriven = true;
  }
  return lastMoved;
}

// Every move is tracked here, so a handler that skips the question cannot leave the anchor stale
let tracking = false;
function startTracking() {
  if (tracking) return;
  tracking = true;
  window.addEventListener('mousemove', (event) => { track(event); }, true);
}

export function pointerMoved(event: { nativeEvent: Event }) {
  startTracking();
  return track(event.nativeEvent as MouseEvent);
}

function keyEvent(keyCode: number) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  return event;
}

export function useWheelNavigation() {
  useEffect(() => {
    startTracking();
    let lastStep = 0;
    const onWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!event.deltaY || isTextField(target) || (target && target.closest('.player') && !target.closest('.picker'))) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastStep < WHEEL_STEP_MS) return;
      lastStep = now;
      window.dispatchEvent(keyEvent(event.deltaY > 0 ? KEY.DOWN : KEY.UP));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);
}
