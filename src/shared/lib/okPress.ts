import { useEffect, useMemo, useRef } from 'react';

export const HOLD_MS = 500;
// Key events that follow each other this closely belong to one press, even where the TV does not mark them as repeats
const BURST_MS = 1500;

interface Action { press: () => void; hold: () => void }

export function useOkPress() {
  const state = useRef<{ timer?: ReturnType<typeof setTimeout>; action?: Action; down: boolean; at: number }>({ down: false, at: 0 });
  const press = useMemo(() => {
    const clear = () => {
      clearTimeout(state.current.timer);
      const { action } = state.current;
      state.current.action = undefined;
      return action;
    };
    return {
      down(event: KeyboardEvent, action: Action) {
        const now = Date.now();
        const sameBurst = state.current.down && now - state.current.at < BURST_MS;
        state.current.at = now;
        if (event.repeat || sameBurst) return;
        clear();
        state.current.down = true;
        state.current.action = action;
        state.current.timer = setTimeout(() => clear()?.hold(), HOLD_MS);
      },
      up() {
        state.current.down = false;
        clear()?.press();
      },
      cancel() {
        state.current.down = false;
        clear();
      },
    };
  }, []);
  useEffect(() => press.cancel, [press]);
  return press;
}
