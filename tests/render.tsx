import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { NavContext, type NavApi } from '../src/shared/lib/nav';

export function makeNav(overrides: Partial<NavApi> = {}): NavApi {
  return { sidebarFocused: false, focusSidebar: vi.fn(), play: vi.fn(), openChannel: vi.fn(), go: vi.fn(), ...overrides };
}

export function renderWithNav(ui: ReactElement, overrides: Partial<NavApi> = {}) {
  const nav = makeNav(overrides);
  const view = render(<NavContext.Provider value={nav}>{ui}</NavContext.Provider>);
  return {
    nav,
    ...view,
    rerenderWithNav: (next: ReactElement, patch: Partial<NavApi> = {}) => view.rerender(<NavContext.Provider value={{ ...nav, ...patch }}>{next}</NavContext.Provider>),
  };
}

export function setViewport(width = 1920, height = 1080) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}
