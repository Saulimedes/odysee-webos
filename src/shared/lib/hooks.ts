import { useEffect, useRef, useState, type MouseEvent } from 'react';

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useBackdropClick(onDismiss: () => void) {
  const pressedInside = useRef(false);
  return {
    onMouseDown: (event: MouseEvent) => { pressedInside.current = event.target !== event.currentTarget; },
    onClick: (event: MouseEvent) => {
      const inside = pressedInside.current;
      pressedInside.current = false;
      if (!inside && event.target === event.currentTarget) onDismiss();
    },
  };
}
