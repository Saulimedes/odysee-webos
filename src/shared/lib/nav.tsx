import { createContext, useContext } from 'react';

export interface NavApi<V = unknown> {
  sidebarFocused: boolean;
  focusSidebar: () => void;
  play: (video: V, startAt?: number) => void;
  openChannel: (id: string, name: string) => void;
  go: (screen: string) => void;
}

const noop = () => {};

export const NavContext = createContext<NavApi>({ sidebarFocused: false, focusSidebar: noop, play: noop, openChannel: noop, go: noop });

export function useNav<V>() {
  return useContext(NavContext) as NavApi<V>;
}
