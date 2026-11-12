import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cssRules, flush, video } from '../../tests/helpers';
import { WheelNavigation, hoverOver, renderWithNav, setViewport, tapOk } from '../../tests/render';
import type { Video } from '@/entities/video';
import type { Channel } from '@/entities/channel';
import { session } from '@/entities/session/model/store';
import { moveEntry, resetLayout, toggleEntry } from '@/features/customize-layout/model/layout';
import { setSetting } from '@/shared/config/settings';
import { contentWidth, getSetting, gridMetrics } from '@/shared/config';
import { Sidebar } from './sidebar';
import { ChannelGrid, FeedGrid, VideoGrid } from './item-grid';
import { VideoRows, type VideoRow } from './video-rows';
import { MasterDetail, type MasterEntry } from './master-detail';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const videos = (count: number, prefix = 'v') => Array.from({ length: count }, (_, index) => video(`${prefix}${index}`) as Video);

beforeEach(() => {
  setViewport();
  fireEvent.keyDown(window, { keyCode: 16 });
  session.set({ token: null, user: null });
  resetLayout('sidebar');
  setSetting('iconVariant', 'outlined');
  setSetting('iconScale', 1);
  setSetting('logoButton', 'off');
});

describe('Sidebar', () => {
  const setup = (focused: boolean) => {
    const props = { selected: 'home', focused, onSelect: vi.fn(), onLeave: vi.fn(), onFocus: vi.fn() };
    render(<Sidebar {...props} />);
    return props;
  };

  it('leaves the account entries and any login entry out for guests', () => {
    setup(false);
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.queryByText('Sign In')).toBeNull();
    expect(screen.queryByText('Following')).toBeNull();
    expect(screen.getByText('Odysee')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('.sidebar__label')).map((node) => node.textContent)).toEqual(['Odysee', 'Search', 'Home', 'Discover', 'Featured', 'Categories', 'Library', 'Settings']);
  });

  it('shows account entries for signed in users, and keeps the plain logo while the logo button is off', () => {
    session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
    setup(false);
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.getByText('Playlists')).toBeInTheDocument();
    expect(screen.queryByText('@me')).toBeNull();
    expect(document.querySelector('.sidebar__brand')?.textContent).toBe('Odysee');
    expect(document.querySelector('.sidebar__brand img')?.getAttribute('src')).toBe('icon.png');
    expect(document.querySelector('.sidebar__brand .avatar')).toBeNull();
  });

  it('shows the signed in user on top when the logo button is Login', () => {
    setSetting('logoButton', 'login');
    session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
    setup(false);
    expect(screen.getByText('@me')).toBeInTheDocument();
    expect(document.querySelector('.sidebar__brand .avatar')).not.toBeNull();
    expect(document.querySelector('.sidebar__brand img[src="icon.png"]')).toBeNull();
  });

  it('cuts the profile picture to the corner style and carries the squircle outline for Classic', () => {
    setSetting('logoButton', 'login');
    session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
    setup(false);
    expect(document.querySelector('.sidebar__brand .avatar')).toHaveClass('avatar--corners');
    const outline = document.querySelector('#squircle');
    expect(outline?.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(outline?.querySelector('path')?.getAttribute('d')).toMatch(/^M1 \.5C.*Z$/);
    expect(document.querySelectorAll('#squircle')).toHaveLength(1);
  });

  it('falls back to the app name and the logo for users without a channel or a picture', () => {
    setSetting('logoButton', 'login');
    session.set({ token: 't', user: { primary_email: 'a@b.c' } });
    setup(false);
    expect(screen.getByText('Odysee')).toBeInTheDocument();
    expect(document.querySelector('.sidebar__brand img')?.getAttribute('src')).toBe('icon.png');
  });

  it('navigates with the remote while focused', () => {
    const props = setup(true);
    press(40); press(40);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('featured');
    press(38); press(38); press(38);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('search');
    press(38);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('settings');
    press(39);
    expect(props.onLeave).toHaveBeenCalled();
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('goes round from the last entry to the first and back', () => {
    const props = setup(true);
    const active = () => document.querySelector('.sidebar__item--active')?.textContent;
    const items = Array.from(document.querySelectorAll('.sidebar__item .sidebar__label')).map((node) => node.textContent);
    for (let index = 0; index < items.length; index++) press(38);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('home');
    for (let index = 0; index < items.length; index++) press(40);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('home');
    while (active() !== items[0]) press(38);
    press(38);
    expect(active()).toBe(items[items.length - 1]);
    press(40);
    expect(active()).toBe(items[0]);
  });

  it('marks the open screen, in the menu and on the logo when that is its button', () => {
    const view = render(<Sidebar selected="home" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
    expect(document.querySelector('.sidebar__item--selected')?.textContent).toBe('Home');
    expect(document.querySelectorAll('.sidebar__item--selected')).toHaveLength(1);
    expect(document.querySelector('.sidebar__brand--selected')).toBeNull();
    view.unmount();
    setSetting('logoButton', 'home');
    render(<Sidebar selected="home" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
    expect(document.querySelector('.sidebar__brand--selected')).not.toBeNull();
    expect(document.querySelector('.sidebar__item--selected')).toBeNull();
  });

  it('ignores the remote while unfocused and supports clicks', () => {
    const props = setup(false);
    press(13);
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Settings'));
    expect(props.onSelect).toHaveBeenCalledWith('settings');
  });

  it('starts at the first item when the selected screen is not in the menu', () => {
    const props = { selected: 'channel', focused: true, onSelect: vi.fn(), onLeave: vi.fn(), onFocus: vi.fn() };
    render(<Sidebar {...props} />);
    press(13);
    expect(props.onSelect).toHaveBeenCalledWith('search');
  });
});

describe('Sidebar with the cursor', () => {
  const setup = (focused: boolean) => {
    const props = { selected: 'home', focused, onSelect: vi.fn(), onLeave: vi.fn(), onFocus: vi.fn() };
    const view = render(<Sidebar {...props} />);
    return { props, view };
  };

  it('opens when the cursor moves onto it, and only then', () => {
    const { props, view } = setup(false);
    hoverOver(document.querySelector('.sidebar') as Element);
    expect(props.onFocus).toHaveBeenCalledTimes(1);
    view.rerender(<Sidebar {...props} focused />);
    hoverOver(document.querySelector('.sidebar') as Element);
    expect(props.onFocus).toHaveBeenCalledTimes(1);
  });

  it('points at the entry under the cursor, which OK then picks', () => {
    const { props } = setup(true);
    hoverOver(screen.getByText('Discover'));
    expect(document.querySelector('.sidebar__item--active')?.textContent).toBe('Discover');
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('discover');
    hoverOver(screen.getByText('Settings'));
    expect(document.querySelector('.sidebar__item--active')?.textContent).toBe('Settings');
  });

  it('points at the logo when it is a button', () => {
    setSetting('logoButton', 'home');
    const { props } = setup(true);
    hoverOver(screen.getByText('Discover'));
    hoverOver(document.querySelector('.sidebar__brand') as Element);
    expect(document.querySelector('.sidebar__brand--active')).not.toBeNull();
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('home');
  });
});

describe('Sidebar customization', () => {
  const labels = () => Array.from(document.querySelectorAll('.sidebar__item .sidebar__label')).map((node) => node.textContent);
  const setup = (focused = true) => {
    const props = { selected: 'home', focused, onSelect: vi.fn(), onLeave: vi.fn(), onFocus: vi.fn() };
    render(<Sidebar {...props} />);
    return props;
  };
  const signIn = () => session.set({ token: 't', user: { primary_email: 'a@b.c' } });

  it('hides the entries the user switched off', () => {
    toggleEntry('sidebar', 'discover');
    toggleEntry('sidebar', 'featured');
    setup();
    expect(labels()).toEqual(['Search', 'Home', 'Categories', 'Library', 'Settings']);
  });

  it('shows the entries in the order the user picked', () => {
    moveEntry('sidebar', ['search', 'home', 'discover', 'featured', 'categories', 'playlists', 'following', 'library', 'settings'], 'home', -1);
    setup();
    expect(labels()).toEqual(['Home', 'Search', 'Discover', 'Featured', 'Categories', 'Library', 'Settings']);
    press(13);
    expect(document.querySelector('.sidebar__item--active')?.textContent).toBe('Home');
  });

  it('never hides Settings', () => {
    toggleEntry('sidebar', 'settings');
    setup();
    expect(labels()).toContain('Settings');
  });

  it('keeps hidden account entries hidden and shows them in order once signed in', () => {
    toggleEntry('sidebar', 'playlists');
    signIn();
    setup();
    expect(labels()).toEqual(['Search', 'Home', 'Discover', 'Featured', 'Categories', 'Following', 'Library', 'Settings']);
  });

  it('keeps Settings alone at the bottom and the other groups in the middle', () => {
    signIn();
    setup(false);
    const groups = Array.from(document.querySelectorAll('.sidebar__group'));
    expect(groups).toHaveLength(3);
    expect(groups[2].className).toContain('sidebar__group--bottom');
    expect(groups[2].textContent).toBe('Settings');
    expect(groups[0].className).not.toContain('sidebar__group--bottom');
    expect(document.querySelectorAll('.sidebar__main .sidebar__group')).toHaveLength(2);
    expect(document.querySelector('.sidebar__main')?.textContent).not.toContain('Settings');
  });

  it('puts the logo above the entries', () => {
    setup(false);
    const nav = document.querySelector('.sidebar') as HTMLElement;
    expect(nav.firstElementChild?.className).toBe('sidebar__brand');
    expect(nav.querySelector('.sidebar__brand')?.textContent).toBe('Odysee');
  });

  it('keeps Settings at the bottom whatever order the user picked', () => {
    const current = ['search', 'home', 'discover', 'featured', 'categories', 'playlists', 'following', 'library', 'settings'];
    for (let index = 0; index < 8; index++) {
      moveEntry('sidebar', current, 'search', 1);
      const at = current.indexOf('search');
      current.splice(at, 1);
      current.splice(at + 1, 0, 'search');
    }
    setup(true);
    const bottom = document.querySelector('.sidebar__group--bottom') as HTMLElement;
    expect(bottom.textContent).toBe('Settings');
    expect(bottom.parentElement?.lastElementChild).toBe(bottom);
    expect(labels()[labels().length - 1]).toBe('Settings');
    for (let guard = 0; guard < 20 && document.querySelector('.sidebar__item--active')?.textContent !== 'Settings'; guard++) press(40);
    expect(document.querySelector('.sidebar__item--active')?.textContent).toBe('Settings');
    press(40);
    expect(document.querySelector('.sidebar__item--active')?.textContent).toBe(labels()[0]);
  });

  describe('logo button', () => {
    it('is only decoration while it is off', () => {
      setup(false);
      const brand = document.querySelector('.sidebar__brand') as HTMLElement;
      expect(brand.className).toBe('sidebar__brand');
      expect(labels()).toContain('Home');
      expect(labels()).toContain('Settings');
    });

    it('takes over Home and removes the Home entry from the list', () => {
      setSetting('logoButton', 'home');
      const props = setup(true);
      const brand = document.querySelector('.sidebar__brand') as HTMLElement;
      expect(brand.className).toContain('sidebar__brand--entry');
      expect(labels()).toEqual(['Search', 'Discover', 'Featured', 'Categories', 'Library', 'Settings']);
      fireEvent.click(brand);
      expect(props.onSelect).toHaveBeenLastCalledWith('home');
    });

    it('takes over Settings and leaves nothing at the bottom', () => {
      setSetting('logoButton', 'settings');
      const props = setup(true);
      expect(labels()).not.toContain('Settings');
      expect(document.querySelector('.sidebar__group--bottom')).toBeNull();
      fireEvent.click(document.querySelector('.sidebar__brand') as HTMLElement);
      expect(props.onSelect).toHaveBeenLastCalledWith('settings');
    });

    it('is the first stop for the remote and shows the focus', () => {
      setSetting('logoButton', 'home');
      const props = setup(true);
      for (let index = 0; index < 7; index++) press(38);
      expect(document.querySelector('.sidebar__brand--active')).not.toBeNull();
      press(13);
      expect(props.onSelect).toHaveBeenLastCalledWith('home');
      press(40);
      expect(document.querySelector('.sidebar__brand--active')).toBeNull();
      press(13);
      expect(props.onSelect).toHaveBeenLastCalledWith('search');
    });

    it.each(['home', 'settings'])('keeps the name of the logo when it is the button for %s, instead of naming that entry', (entry) => {
      setSetting('logoButton', entry);
      setup(true);
      const brand = document.querySelector('.sidebar__brand') as HTMLElement;
      expect(brand.className).toContain('sidebar__brand--entry');
      expect(brand.textContent).toBe('Odysee');
      expect(brand.querySelector('.sidebar__brandName')?.textContent).toBe('Odysee');
    });

    it.each([['off', 'Odysee'], ['home', 'Odysee'], ['settings', 'Odysee'], ['login', '@me']])('names the logo %s after the signed in channel only for Login', (entry, name) => {
      setSetting('logoButton', entry);
      session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
      setup(false);
      expect(document.querySelector('.sidebar__brand')?.textContent).toBe(name);
    });

    describe('Login', () => {
      const guest = () => {
        setSetting('logoButton', 'login');
        return setup(true);
      };
      const signedIn = () => session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });

      it('is the button for the login screen while nobody is signed in, and leaves the menu as it is', () => {
        const props = guest();
        const brand = document.querySelector('.sidebar__brand') as HTMLElement;
        expect(brand.className).toContain('sidebar__brand--entry');
        expect(brand.textContent).toBe('Odysee');
        expect(brand.querySelector('img')?.getAttribute('src')).toBe('icon.png');
        expect(labels()).toEqual(['Search', 'Home', 'Discover', 'Featured', 'Categories', 'Library', 'Settings']);
        fireEvent.click(brand);
        expect(props.onSelect).toHaveBeenLastCalledWith('login');
      });

      it('is the first stop of the remote and opens the login screen with OK', () => {
        const props = guest();
        press(38);
        expect(document.querySelector('.sidebar__item--active')?.textContent).toBe('Search');
        press(38);
        expect(document.querySelector('.sidebar__brand--active')).not.toBeNull();
        press(13);
        expect(props.onSelect).toHaveBeenLastCalledWith('login');
        press(40);
        expect(document.querySelector('.sidebar__brand--active')).toBeNull();
        press(13);
        expect(props.onSelect).toHaveBeenLastCalledWith('search');
      });

      it('is marked while the login screen is open, and starts the remote on it', () => {
        setSetting('logoButton', 'login');
        render(<Sidebar selected="login" focused onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
        expect(document.querySelector('.sidebar__brand--selected')).not.toBeNull();
        expect(document.querySelector('.sidebar__brand--active')).not.toBeNull();
        expect(document.querySelector('.sidebar__item--selected')).toBeNull();
      });

      it('shows the user and is neither a button nor a stop for the remote once someone is signed in', () => {
        signedIn();
        const props = guest();
        const brand = document.querySelector('.sidebar__brand') as HTMLElement;
        expect(brand.className).toBe('sidebar__brand');
        expect(brand.textContent).toBe('@me');
        fireEvent.click(brand);
        expect(props.onSelect).not.toHaveBeenCalled();
        for (let index = 0; index < 20; index++) press(38);
        expect(document.querySelector('.sidebar__brand--active')).toBeNull();
        expect(labels()).toContain('Home');
      });

      it('turns into the button again when the user signs out', () => {
        signedIn();
        guest();
        expect(document.querySelector('.sidebar__brand--entry')).toBeNull();
        act(() => { session.set({ token: null, user: null }); });
        expect(document.querySelector('.sidebar__brand--entry')).not.toBeNull();
        expect(document.querySelector('.sidebar__brand')?.textContent).toBe('Odysee');
      });
    });

    it('marks Settings in the menu while the login screen is open, unless the logo is the login button', () => {
      render(<Sidebar selected="login" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
      expect(document.querySelector('.sidebar__item--selected')?.textContent).toBe('Settings');
      expect(document.querySelector('.sidebar__brand--selected')).toBeNull();
    });

    it('starts on the logo when the current screen is the one it stands for', () => {
      setSetting('logoButton', 'home');
      setup(true);
      expect(document.querySelector('.sidebar__brand--active')).not.toBeNull();
    });

    it('shows the Odysee logo instead of the avatar so it reads as a button', () => {
      setSetting('logoButton', 'settings');
      session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
      setup(false);
      expect(document.querySelector('.sidebar__brand img')?.getAttribute('src')).toBe('icon.png');
      expect(screen.queryByText('@me')).toBeNull();
    });
  });

  it('draws outlined, filled and dynamic icons', () => {
    const { unmount } = render(<Sidebar selected="home" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
    const strokes = () => Array.from(document.querySelectorAll('.sidebar__item svg')).map((svg) => svg.getAttribute('stroke-width'));
    const fills = () => document.querySelectorAll('.sidebar__item svg[fill="currentColor"]').length;
    expect(fills()).toBe(0);
    unmount();

    setSetting('iconVariant', 'filled');
    const filled = render(<Sidebar selected="home" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
    expect(fills()).toBe(7);
    expect(strokes()).toEqual(Array(7).fill(null));
    filled.unmount();

    setSetting('iconVariant', 'dynamic');
    render(<Sidebar selected="home" focused={false} onSelect={vi.fn()} onLeave={vi.fn()} onFocus={vi.fn()} />);
    expect(fills()).toBe(1);
  });

  it('scales the icons', () => {
    setSetting('iconScale', 1.3);
    setup(false);
    expect((document.querySelector('.sidebar') as HTMLElement).style.getPropertyValue('--icon-size')).toBe('52px');
    expect(document.querySelector('.sidebar__item svg')?.getAttribute('width')).toBe('52');
  });
});

describe('Sidebar layout', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');
  const only = (selector: string) => {
    const rules = cssRules(css, selector);
    expect(rules).toHaveLength(1);
    return rules[0];
  };

  it('is a column with the same padding above and below, so the entries can sit in the middle', () => {
    const bar = only('.sidebar');
    expect(bar.display).toBe('flex');
    expect(bar['flex-direction']).toBe('column');
    expect(bar.padding).toBe('108px 0');
    expect(only('.sidebar__brand').position).toBe('absolute');
  });

  it('marks the open screen with the curved left edge of the submenus, which the Corners setting shapes', () => {
    expect(only('.sidebar__item--selected')['box-shadow']).toBe('inset 5px 0 0 var(--accent)');
    expect(only('.sidebar__brand--selected')['box-shadow']).toBe('inset 5px 0 0 var(--accent)');
    expect(only('.sidebar__item')['border-radius']).toBe('var(--radius-lg)');
    expect(only('.sidebar__brand--entry')['border-radius']).toBe('var(--radius-lg)');
  });

  it('centres the entries with auto margins around them', () => {
    expect(only('.sidebar__main').margin).toBe('auto 0');
  });

  it('draws Settings at the bottom edge with an absolute position', () => {
    const bottom = only('.sidebar__group--bottom');
    expect(bottom.position).toBe('absolute');
    expect(bottom.bottom).toBe('16px');
  });

  it('does not push a group to the bottom with auto margins', () => {
    expect(cssRules(css, '.sidebar__group--bottom').filter((rule) => rule['margin-top'] === 'auto')).toEqual([]);
    expect(css).not.toMatch(/sidebar__group--bottom[^{}]*\{[^{}]*margin-top:\s*auto/);
  });
});

describe('VideoGrid', () => {
  it('renders cards, moves focus and plays the selected video', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g1" videos={videos(10)} title="Title" subtitle="Sub" emptyTitle="Empty" />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Video v0')).toBeInTheDocument();
    press(39);
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }), expect.any(Array));
  });

  it('opens the sidebar from the first column', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g2" videos={videos(4)} emptyTitle="Empty" />);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
  });

  it('ignores the remote while the sidebar is open or the grid is disabled', () => {
    const { nav, rerenderWithNav } = renderWithNav(<VideoGrid stateKey="g3" videos={videos(4)} emptyTitle="Empty" />, { sidebarFocused: true });
    press(13);
    expect(nav.play).not.toHaveBeenCalled();
    rerenderWithNav(<VideoGrid stateKey="g3" videos={videos(4)} emptyTitle="Empty" enabled={false} />, { sidebarFocused: false });
    press(13);
    expect(nav.play).not.toHaveBeenCalled();
  });

  it('shows loading, error and empty states', () => {
    const { rerenderWithNav } = renderWithNav(<VideoGrid stateKey="g4" videos={[]} loading emptyTitle="Empty" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerenderWithNav(<VideoGrid stateKey="g4" videos={[]} error="Failed to load videos" emptyTitle="Empty" />);
    expect(screen.getByText('Failed to load videos')).toBeInTheDocument();
    rerenderWithNav(<VideoGrid stateKey="g4" videos={[]} emptyTitle="Empty" emptyHint="Hint" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
  });

  it('asks for more near the end and shows the spinner', () => {
    const onLoadMore = vi.fn();
    renderWithNav(<VideoGrid stateKey="g5" videos={videos(8)} emptyTitle="Empty" onLoadMore={onLoadMore} loadingMore />);
    press(40);
    expect(onLoadMore).toHaveBeenCalled();
    expect(document.querySelector('.itemGrid__more')).not.toBeNull();
  });

  describe('asks for the next page before the rows run out', () => {
    const columns = () => gridMetrics(contentWidth(), getSetting('tileScale')).columns;

    it('at once when a short page is all there is, without a key press', () => {
      const onLoadMore = vi.fn();
      renderWithNav(<VideoGrid stateKey="n1" videos={videos(columns() * 3)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('not while more than two rows are left, and then as soon as the selection is within two rows of the end', () => {
      const onLoadMore = vi.fn();
      renderWithNav(<VideoGrid stateKey="n2" videos={videos(columns() * 6)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      expect(onLoadMore).not.toHaveBeenCalled();
      press(40); press(40);
      expect(onLoadMore).not.toHaveBeenCalled();
      press(40);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('asks again when a page arrives that still leaves two rows or less, and not for the same grid twice', () => {
      const onLoadMore = vi.fn();
      const { rerenderWithNav } = renderWithNav(<VideoGrid stateKey="n3" videos={videos(columns() * 2)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      rerenderWithNav(<VideoGrid stateKey="n3" videos={videos(columns() * 2)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      rerenderWithNav(<VideoGrid stateKey="n3" videos={videos(columns() * 3)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
      rerenderWithNav(<VideoGrid stateKey="n3" videos={videos(columns() * 8)} emptyTitle="Empty" onLoadMore={onLoadMore} />);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });

    it('waits while the grid is disabled or the sidebar has the focus', () => {
      const onLoadMore = vi.fn();
      const { rerenderWithNav } = renderWithNav(<VideoGrid stateKey="n4" videos={videos(columns() * 3)} emptyTitle="Empty" onLoadMore={onLoadMore} enabled={false} />);
      expect(onLoadMore).not.toHaveBeenCalled();
      rerenderWithNav(<VideoGrid stateKey="n4" videos={videos(columns() * 3)} emptyTitle="Empty" onLoadMore={onLoadMore} />, { sidebarFocused: true });
      expect(onLoadMore).not.toHaveBeenCalled();
      rerenderWithNav(<VideoGrid stateKey="n4" videos={videos(columns() * 3)} emptyTitle="Empty" onLoadMore={onLoadMore} />, { sidebarFocused: false });
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  it('opens the menu of the focused video when OK is held, and does not play it', () => {
    vi.useFakeTimers();
    const { nav } = renderWithNav(<VideoGrid stateKey="g-hold" videos={videos(10)} emptyTitle="Empty" />);
    press(39);
    fireEvent.keyDown(window, { keyCode: 13 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(nav.openMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
    fireEvent.keyUp(window, { keyCode: 13 });
    expect(nav.play).not.toHaveBeenCalled();
  });

  it('opens the menu with a right click', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g-context" videos={videos(10)} emptyTitle="Empty" />);
    expect(fireEvent.contextMenu(screen.getByText('Video v2'))).toBe(false);
    expect(nav.openMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' }));
    expect(nav.play).not.toHaveBeenCalled();
  });

  it('plays a video from the list it is in, so that the next one can follow', () => {
    const list = videos(4);
    const { nav } = renderWithNav(<VideoGrid stateKey="g-queue" videos={list} emptyTitle="Empty" />);
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'v0' }), list);
  });

  it('selects by click', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g6" videos={videos(12)} emptyTitle="Empty" />);
    fireEvent.click(screen.getByText('Video v2'));
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' }), expect.any(Array));
  });

  it('moves a row with the wheel', () => {
    renderWithNav(<><WheelNavigation /><VideoGrid stateKey="g-wheel" videos={videos(30)} emptyTitle="Empty" /></>);
    const { columns } = gridMetrics(contentWidth(), 1);
    const active = () => document.querySelector('.card--active')?.textContent;
    expect(active()).toContain('Video v0');
    fireEvent.wheel(document.body, { deltaY: 100 });
    expect(active()).toContain(`Video v${columns}`);
  });

  it('selects the card under the cursor without scrolling, and the keys follow again', () => {
    renderWithNav(<VideoGrid stateKey="g-hover" videos={videos(40)} emptyTitle="Empty" />);
    const shift = () => (document.querySelector('.vgrid__inner') as HTMLElement).style.transform;
    const before = shift();
    hoverOver(screen.getByText('Video v5').closest('.card') as Element);
    expect(document.querySelector('.card--active')?.textContent).toContain('Video v5');
    hoverOver(screen.getByText('Video v7').closest('.card') as Element);
    expect(document.querySelector('.card--active')?.textContent).toContain('Video v7');
    expect(shift()).toBe(before);
    for (let index = 0; index < 8; index++) press(40);
    expect(shift()).not.toBe(before);
  });

  it('shows watch progress on cards and clamps a remembered index', () => {
    const { rerenderWithNav } = renderWithNav(<VideoGrid stateKey="g7" videos={videos(10)} emptyTitle="Empty" progress={() => 50} />);
    expect(document.querySelectorAll('.card__progress').length).toBeGreaterThan(0);
    press(40); press(40);
    rerenderWithNav(<VideoGrid stateKey="g7" videos={videos(2)} emptyTitle="Empty" />);
    expect(document.querySelectorAll('.card--active')).toHaveLength(1);
  });

  it('keeps the position after leaving and returning', () => {
    const first = renderWithNav(<VideoGrid stateKey="g8" videos={videos(10)} emptyTitle="Empty" />);
    press(39); press(39);
    first.unmount();
    renderWithNav(<VideoGrid stateKey="g8" videos={videos(10)} emptyTitle="Empty" />);
    expect(document.querySelector('.card--active')).toHaveTextContent('Video v2');
  });
});

describe('FeedGrid', () => {
  it('loads pages on demand without duplicates', async () => {
    const fetchPage = vi.fn(async (page: number) => (page === 1 ? videos(4, 'a') : [...videos(2, 'a'), ...videos(1, 'b')]));
    renderWithNav(<FeedGrid feedKey="feed-1" fetchPage={fetchPage} pageSize={4} emptyTitle="Empty" title="Feed" />);
    await screen.findByText('Video a0');
    press(40);
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.getByText('Video a0')).toBeInTheDocument());
    press(40);
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('reuses loaded pages when remounted', async () => {
    const fetchPage = vi.fn(async () => videos(30, 'c'));
    const first = renderWithNav(<FeedGrid feedKey="feed-2" fetchPage={fetchPage} pageSize={30} emptyTitle="Empty" />);
    await screen.findByText('Video c0');
    first.unmount();
    renderWithNav(<FeedGrid feedKey="feed-2" fetchPage={fetchPage} pageSize={30} emptyTitle="Empty" />);
    expect(screen.getByText('Video c0')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  describe('with a first page that is already known', () => {
    it('shows it on the first render without a spinner or a request when it is fresh', async () => {
      const fetchPage = vi.fn(async () => videos(2, 'new'));
      renderWithNav(<FeedGrid feedKey="feed-known-1" fetchPage={fetchPage} pageSize={5} firstPage={() => ({ videos: videos(3, 'k'), stale: false })} emptyTitle="Empty" />);
      expect(screen.getByText('Video k0')).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      await flush();
      expect(fetchPage).not.toHaveBeenCalled();
    });

    it('shows a stale one at once and refreshes it without blanking the grid', async () => {
      let release: (list: Video[]) => void = () => {};
      const fetchPage = vi.fn(() => new Promise<Video[]>((resolve) => { release = resolve; }));
      renderWithNav(<FeedGrid feedKey="feed-known-2" fetchPage={fetchPage} pageSize={5} firstPage={() => ({ videos: videos(3, 'k'), stale: true })} emptyTitle="Empty" />);
      expect(screen.getByText('Video k0')).toBeInTheDocument();
      await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(1));
      expect(screen.getByText('Video k0')).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      await act(async () => { release(videos(2, 'fresh')); });
      expect(await screen.findByText('Video fresh0')).toBeInTheDocument();
      expect(screen.queryByText('Video k0')).toBeNull();
    });

    it('knows whether more pages can follow from the size of the known page', async () => {
      const fetchPage = vi.fn(async (page: number) => (page === 2 ? videos(1, 'p2') : videos(4, 'k')));
      renderWithNav(<FeedGrid feedKey="feed-known-3" fetchPage={fetchPage} pageSize={4} firstPage={() => ({ videos: videos(4, 'k'), stale: false })} emptyTitle="Empty" />);
      expect(screen.getByText('Video k0')).toBeInTheDocument();
      await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(2));
      expect(fetchPage).not.toHaveBeenCalledWith(1);
    });

    it('prefers the pages the grid has loaded itself over the known first page', async () => {
      const fetchPage = vi.fn(async () => videos(30, 'own'));
      const first = renderWithNav(<FeedGrid feedKey="feed-known-4" fetchPage={fetchPage} pageSize={30} emptyTitle="Empty" />);
      await screen.findByText('Video own0');
      first.unmount();
      renderWithNav(<FeedGrid feedKey="feed-known-4" fetchPage={fetchPage} pageSize={30} firstPage={() => ({ videos: videos(3, 'k'), stale: false })} emptyTitle="Empty" />);
      expect(screen.getByText('Video own0')).toBeInTheDocument();
      expect(screen.queryByText('Video k0')).toBeNull();
    });
  });

  it('shows an error when the first page fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithNav(<FeedGrid feedKey="feed-3" fetchPage={async () => { throw new Error('x'); }} pageSize={3} emptyTitle="Empty" />);
    expect(await screen.findByText('Failed to load videos')).toBeInTheDocument();
  });
});

describe('ChannelGrid', () => {
  const channels: Channel[] = [{ id: 'c1', name: 'one', title: 'One', description: 'First', thumb: null }, { id: 'c2', name: 'two', title: 'Two', description: '', thumb: null }];

  it('renders channels and selects one', () => {
    const onSelect = vi.fn();
    renderWithNav(<ChannelGrid stateKey="ch1" channels={channels} emptyTitle="None" onSelect={onSelect} />);
    expect(screen.getByText('@one')).toBeInTheDocument();
    press(39);
    press(13);
    expect(onSelect).toHaveBeenCalledWith(channels[1]);
    fireEvent.click(screen.getByText('One'));
    expect(onSelect).toHaveBeenCalledWith(channels[0]);
  });

  it('selects the channel under the cursor', () => {
    const list: Channel[] = [{ id: 'c1', name: 'one', title: 'Channel One', thumb: null, description: '' }, { id: 'c2', name: 'two', title: 'Channel Two', thumb: null, description: '' }];
    renderWithNav(<ChannelGrid stateKey="ch-hover" channels={list} emptyTitle="None" onSelect={() => {}} />);
    hoverOver(screen.getByText('Channel Two').closest('.card') as Element);
    expect(document.querySelector('.card--active')?.textContent).toContain('Channel Two');
  });

  it('shows the empty state', () => {
    renderWithNav(<ChannelGrid stateKey="ch2" channels={[]} emptyTitle="No channels" onSelect={() => {}} />);
    expect(screen.getByText('No channels')).toBeInTheDocument();
  });
});

describe('VideoRows', () => {
  const rows = (): VideoRow[] => [
    { id: 'r1', title: 'First', videos: videos(8, 'a'), status: 'ready', hasMore: true, icon: 'Gaming', progress: () => 30 },
    { id: 'r2', title: 'Second', videos: videos(3, 'b'), status: 'ready' },
    { id: 'r3', title: 'Loading', videos: [], status: 'loading' },
    { id: 'r4', title: 'Broken', videos: [], status: 'error' },
  ];

  it('shows rows, skeletons and hides failed rows', () => {
    renderWithNav(<VideoRows stateKey="vr1" rows={rows()} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.queryByText('Broken')).toBeNull();
    expect(document.querySelector('.videoRow svg')).not.toBeNull();
  });

  it('lets the icon of a row follow the Menu Icon Style and marks the row that has the focus', () => {
    renderWithNav(<VideoRows stateKey="vr-icons" rows={rows()} />);
    expect(document.querySelector('.videoRow__title svg')?.getAttribute('class')).toBe('odyIcon');
    expect(document.querySelectorAll('.videoRow--active')).toHaveLength(1);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('First');
    press(40);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('Second');
    expect(document.querySelectorAll('.videoRow--active')).toHaveLength(1);
  });

  it('moves across and between rows and plays the focused card', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="vr2" rows={rows()} />);
    press(39); press(39);
    tapOk();
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a2' }), expect.any(Array));
    press(40);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    tapOk();
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b0' }), expect.any(Array));
    press(40);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('Loading');
    const played = (nav.play as ReturnType<typeof vi.fn>).mock.calls.length;
    tapOk();
    expect(nav.play).toHaveBeenCalledTimes(played);
    press(40);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('Loading');
    press(38);
    press(38);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('First');
    press(37);
    press(37);
    expect(nav.focusSidebar).not.toHaveBeenCalled();
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
  });

  it('reports the active row and loads more near the end of a row', () => {
    const onActiveRow = vi.fn();
    const onLoadMore = vi.fn();
    renderWithNav(<VideoRows stateKey="vr3" rows={rows()} onActiveRow={onActiveRow} onLoadMore={onLoadMore} />);
    expect(onActiveRow).toHaveBeenCalledWith('r1');
    press(39); press(39); press(39);
    expect(onLoadMore).toHaveBeenCalledWith('r1');
  });

  it('reports the top edge and supports a disabled state', () => {
    const onTopEdge = vi.fn();
    const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="vr4" rows={rows()} onTopEdge={onTopEdge} />);
    press(38);
    expect(onTopEdge).toHaveBeenCalled();
    rerenderWithNav(<VideoRows stateKey="vr4" rows={rows()} enabled={false} />);
    expect(document.querySelector('.card--active')).toBeNull();
  });

  it('keeps the focused row when rows are added above it', () => {
    const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="vr5" rows={rows()} />);
    press(40);
    rerenderWithNav(<VideoRows stateKey="vr5" rows={[{ id: 'new', title: 'Continue', videos: videos(1, 'n'), status: 'ready' }, ...rows()]} />);
    expect(document.querySelector('.card--active')).toHaveTextContent('Video b0');
  });

  it('opens the menu of the focused card when OK is held, and plays it when OK is tapped', () => {
    vi.useFakeTimers();
    const { nav } = renderWithNav(<VideoRows stateKey="vr-hold" rows={rows()} />);
    press(39);
    fireEvent.keyDown(window, { keyCode: 13 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(nav.openMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    fireEvent.keyUp(window, { keyCode: 13 });
    expect(nav.play).not.toHaveBeenCalled();
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), rows()[0].videos);
  });

  it('opens the menu of a card with a right click', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="vr-context" rows={rows()} />);
    fireEvent.contextMenu(screen.getByText('Video a2'));
    expect(nav.openMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2' }));
    expect(nav.play).not.toHaveBeenCalled();
  });

  it('plays on click', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="vr6" rows={rows()} />);
    fireEvent.click(screen.getByText('Video a1'));
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), expect.any(Array));
  });

  it('moves between rows with the wheel', () => {
    renderWithNav(<><WheelNavigation /><VideoRows stateKey="vr-wheel" rows={rows()} /></>);
    const title = () => document.querySelector('.videoRow--active .videoRow__title')?.textContent;
    expect(title()).toBe('First');
    fireEvent.wheel(document.body, { deltaY: 100 });
    expect(title()).toBe('Second');
  });

  describe('at the ends', () => {
    const three = (): VideoRow[] => [
      { id: 'r1', title: 'First', videos: videos(8, 'a'), status: 'ready' },
      { id: 'r2', title: 'Second', videos: videos(8, 'b'), status: 'ready' },
      { id: 'r3', title: 'Third', videos: videos(8, 'c'), status: 'ready' },
    ];
    const title = () => document.querySelector('.videoRow--active .videoRow__title')?.textContent;
    const later = (ms = 400) => act(() => { vi.setSystemTime(Date.now() + ms); });
    const pressAfter = (keyCode: number, ms = 400) => { later(ms); press(keyCode); };

    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1_000_000); });
    afterEach(() => { vi.useRealTimers(); });

    it('jumps from the last row to the first when Down is pressed again, and from the first to the last on Up', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap1" rows={three()} wrap />);
      press(40);
      pressAfter(40);
      expect(title()).toBe('Third');
      pressAfter(40);
      expect(title()).toBe('First');
      pressAfter(38);
      expect(title()).toBe('Third');
      pressAfter(38);
      expect(title()).toBe('Second');
    });

    it('keeps the column of the row it lands on', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap2" rows={three()} wrap />);
      press(39); press(39);
      pressAfter(38);
      expect(title()).toBe('Third');
      pressAfter(40);
      expect(title()).toBe('First');
      expect(document.querySelector('.card--active')).toHaveTextContent('Video a2');
    });

    it('stops at the end while the keys keep coming, as for a long scroll with the wheel', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap3" rows={three()} wrap />);
      press(40); press(40);
      for (let step = 0; step < 6; step++) pressAfter(40, 120);
      expect(title()).toBe('Third');
      pressAfter(40);
      expect(title()).toBe('First');
    });

    it('stops at the top as well while the keys keep coming', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap4" rows={three()} wrap />);
      for (let step = 0; step < 6; step++) pressAfter(38, 120);
      expect(title()).toBe('First');
      pressAfter(38);
      expect(title()).toBe('Third');
    });

    it('does not wrap on a key that is held down', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap5" rows={three()} wrap />);
      press(40); press(40);
      later(600);
      fireEvent.keyDown(window, { keyCode: 40, repeat: true });
      expect(title()).toBe('Third');
      pressAfter(40);
      expect(title()).toBe('First');
    });

    it('wraps with the wheel after a pause', () => {
      renderWithNav(<><WheelNavigation /><VideoRows stateKey="vr-wrap6" rows={three()} wrap /></>);
      fireEvent.wheel(document.body, { deltaY: 100 });
      later();
      fireEvent.wheel(document.body, { deltaY: 100 });
      later();
      fireEvent.wheel(document.body, { deltaY: 100 });
      expect(title()).toBe('First');
      later();
      fireEvent.wheel(document.body, { deltaY: -100 });
      expect(title()).toBe('Third');
    });

    it('stays on the first and the last row without wrap, as the Library does', () => {
      const onTopEdge = vi.fn();
      renderWithNav(<VideoRows stateKey="vr-wrap7" rows={three()} onTopEdge={onTopEdge} />);
      press(40);
      pressAfter(40);
      pressAfter(40);
      expect(title()).toBe('Third');
      pressAfter(40);
      expect(title()).toBe('Third');
      press(38); pressAfter(38);
      expect(title()).toBe('First');
      pressAfter(38);
      expect(title()).toBe('First');
      expect(onTopEdge).toHaveBeenCalledTimes(1);
    });

    it('has nowhere to go with a single row', () => {
      renderWithNav(<VideoRows stateKey="vr-wrap8" rows={three().slice(0, 1)} wrap />);
      pressAfter(40);
      pressAfter(38);
      expect(title()).toBe('First');
    });

    it('wraps round instead of reporting the top edge when both are given', () => {
      const onTopEdge = vi.fn();
      renderWithNav(<VideoRows stateKey="vr-wrap9" rows={three()} wrap onTopEdge={onTopEdge} />);
      pressAfter(38);
      expect(title()).toBe('Third');
      expect(onTopEdge).not.toHaveBeenCalled();
    });

    it('goes to the last row at once, also when it has not been loaded yet, and walks back up through rows that are still loading', () => {
      const pending = (): VideoRow[] => [
        ...three().slice(0, 2),
        { id: 'r3', title: 'Third', videos: [], status: 'idle' },
        { id: 'r4', title: 'Fourth', videos: [], status: 'idle' },
      ];
      const onActiveRow = vi.fn();
      renderWithNav(<VideoRows stateKey="vr-wrap10" rows={pending()} onActiveRow={onActiveRow} wrap />);
      pressAfter(38);
      expect(title()).toBe('Fourth');
      expect(onActiveRow).toHaveBeenLastCalledWith('r4');
      pressAfter(38);
      expect(title()).toBe('Third');
      expect(onActiveRow).toHaveBeenLastCalledWith('r3');
      pressAfter(38);
      expect(title()).toBe('Second');
    });

    it('stays near its place when the row it is on turns out to be empty and goes', () => {
      const rows = (last: VideoRow['status']): VideoRow[] => [
        ...three().slice(0, 2),
        { id: 'r3', title: 'Third', videos: [], status: last },
        { id: 'r4', title: 'Fourth', videos: videos(4, 'd'), status: 'ready' },
      ];
      const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="vr-wrap11" rows={rows('loading')} />);
      press(40);
      pressAfter(40);
      expect(title()).toBe('Third');
      rerenderWithNav(<VideoRows stateKey="vr-wrap11" rows={rows('ready')} />);
      expect(title()).toBe('Fourth');
    });
  });

  it('points at the card under the cursor in any row on the screen, without scrolling', () => {
    renderWithNav(<VideoRows stateKey="vr-hover" rows={rows()} />);
    const page = () => (document.querySelector('.videoRows__inner') as HTMLElement).style.transform;
    const trackOf = (title: string) => (screen.getByText(title).closest('.videoRow')?.querySelector('.videoRow__track') as HTMLElement).style.transform;
    const pageBefore = page();
    const trackBefore = trackOf('Second');
    hoverOver(screen.getByText('Video b1').closest('.card') as Element);
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('Second');
    expect(document.querySelector('.card--active')?.textContent).toContain('Video b1');
    expect(page()).toBe(pageBefore);
    expect(trackOf('Second')).toBe(trackBefore);
    press(39);
    expect(document.querySelector('.card--active')?.textContent).toContain('Video b2');
    expect(page()).not.toBe(pageBefore);
  });

  it('does nothing without rows', () => {
    renderWithNav(<VideoRows stateKey="vr7" rows={[]} />);
    press(13);
  });
});

describe('MasterDetail', () => {
  const entries: MasterEntry[] = [
    { id: 'all', label: 'All', icon: <b>i</b> },
    { id: 'ch1', label: 'Channel one', avatar: 'https://x/a.png', dot: true },
    { id: 'ch2', label: 'Channel two', avatar: null },
  ];

  const detail = vi.fn((entry: MasterEntry, context: { enabled: boolean; leaveToList: () => void }) => (
    <div data-testid="detail" data-enabled={String(context.enabled)}>{entry.label}<button onClick={context.leaveToList}>leave</button></div>
  ));

  beforeEach(() => { detail.mockClear(); vi.useFakeTimers(); });

  it('lists entries and shows the selected detail after a short delay', () => {
    renderWithNav(<MasterDetail stateKey="md1" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Channel one')).toBeInTheDocument();
    expect(document.querySelector('.entry__dot')).not.toBeNull();
    expect(screen.getByTestId('detail')).toHaveTextContent('All');
    press(40);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('Channel one');
    press(38);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('All');
  });

  it('goes round at both ends of the list', () => {
    renderWithNav(<MasterDetail stateKey="md-wrap" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    const selected = () => document.querySelector('.entry--selected .entry__label')?.textContent;
    expect(selected()).toBe('All');
    press(38);
    expect(selected()).toBe('Channel two');
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('Channel two');
    press(40);
    expect(selected()).toBe('All');
    press(40); press(40);
    expect(selected()).toBe('Channel two');
    press(40);
    expect(selected()).toBe('All');
  });

  it('hands the focus between the list and the details as the cursor moves, and points at an entry', () => {
    renderWithNav(<MasterDetail stateKey="md-hover" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    const collapsed = () => document.querySelector('.masterDetail--collapsed') !== null;
    expect(collapsed()).toBe(false);
    hoverOver(screen.getByTestId('detail'));
    expect(collapsed()).toBe(true);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'true');
    hoverOver(screen.getByText('Channel two'));
    expect(collapsed()).toBe(false);
    expect(document.querySelector('.entry--selected .entry__label')?.textContent).toBe('Channel two');
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('Channel two');
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'false');
  });

  describe('while the details have the focus', () => {
    const list = () => document.querySelector('.masterDetail__list') as HTMLElement;
    const widths = vi.fn();
    const sized = vi.fn((entry: MasterEntry, context: { width: number }) => { widths(context.width); return <div data-testid="detail">{entry.label}</div>; });

    it('shrinks the list to its icons, so the videos get the room', () => {
      widths.mockClear();
      renderWithNav(<MasterDetail stateKey="md-collapse" title="Browse" entries={entries} emptyTitle="None" renderDetail={sized} />);
      expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
      expect(list().style.width).toBe('440px');
      const wide = widths.mock.calls[widths.mock.calls.length - 1][0] as number;
      press(39);
      expect(document.querySelector('.masterDetail--collapsed')).not.toBeNull();
      expect(list().style.width).toBe('92px');
      const narrow = widths.mock.calls[widths.mock.calls.length - 1][0] as number;
      expect(narrow - wide).toBe(440 - 92);
    });

    it('keeps the icons and the focused entry and hides the names', () => {
      renderWithNav(<MasterDetail stateKey="md-collapse2" title="Browse" entries={entries} emptyTitle="None" renderDetail={sized} />);
      press(39);
      expect(document.querySelectorAll('.masterDetail--collapsed .entry')).toHaveLength(3);
      expect(document.querySelector('.entry--selected')).not.toBeNull();
      expect(document.querySelector('.entry__dot')).not.toBeNull();
      expect(document.querySelector('.entry--active')).toBeNull();
    });

    it('grows back when the focus returns to the list, with Back or Left', () => {
      renderWithNav(<MasterDetail stateKey="md-collapse3" title="Browse" entries={entries} emptyTitle="None" renderDetail={sized} />);
      press(13);
      expect(document.querySelector('.masterDetail--collapsed')).not.toBeNull();
      press(461);
      expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
      expect(list().style.width).toBe('440px');
      press(39);
      press(37);
      expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
    });

    it('stays as it is when there is nothing to show, and the CSS hides names and the title', () => {
      renderWithNav(<MasterDetail stateKey="md-collapse4" title="Browse" entries={[]} emptyTitle="None" renderDetail={sized} />);
      press(39);
      expect(document.querySelector('.masterDetail--collapsed')).toBeNull();
      const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');
      expect(cssRules(css, '.masterDetail--collapsed .entry__label')[0].display).toBe('none');
      expect(cssRules(css, '.masterDetail--collapsed .masterDetail__title')[0].visibility).toBe('hidden');
      expect(cssRules(css, '.masterDetail--collapsed .entry')[0]['justify-content']).toBe('center');
    });
  });

  it('moves focus into the detail and back', () => {
    const { nav } = renderWithNav(<MasterDetail stateKey="md2" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'false');
    press(39);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'true');
    press(461);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'false');
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
    press(13);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'true');
    press(37);
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'false');
    press(13);
    fireEvent.click(screen.getByText('leave'));
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'false');
  });

  it('selects by click', () => {
    renderWithNav(<MasterDetail stateKey="md3" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    fireEvent.click(screen.getByText('Channel two'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('Channel two');
    expect(screen.getByTestId('detail')).toHaveAttribute('data-enabled', 'true');
  });

  it('shows loading and empty states', () => {
    const { rerenderWithNav } = renderWithNav(<MasterDetail stateKey="md4" title="Browse" entries={[]} loading emptyTitle="None" renderDetail={detail} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerenderWithNav(<MasterDetail stateKey="md4" title="Browse" entries={[]} emptyTitle="Nothing here" renderDetail={detail} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(detail).not.toHaveBeenCalled();
  });

  it('clamps the selection when entries shrink', () => {
    const { rerenderWithNav } = renderWithNav(<MasterDetail stateKey="md5" title="Browse" entries={entries} emptyTitle="None" renderDetail={detail} />);
    press(40); press(40);
    rerenderWithNav(<MasterDetail stateKey="md5" title="Browse" entries={entries.slice(0, 2)} emptyTitle="None" renderDetail={detail} />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('detail')).toHaveTextContent('Channel one');
  });
});

describe('Focus rings', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');

  it('are drawn inside the box for the page list and the settings rows', () => {
    ['.entry--active', '.row--active'].forEach((selector) => {
      const rules = cssRules(css, selector);
      expect(rules).toHaveLength(1);
      expect(rules[0]['box-shadow']).toMatch(/^inset 0 0 0 3px var\(--accent\)$/);
    });
    expect(cssRules(css, '.entry--selected')[0]['box-shadow']).toBe('inset 5px 0 0 var(--accent)');
  });

  it('are the only box shadows of the lists, none of them reaches outside', () => {
    ['.entry', '.entry--selected', '.entry--active', '.row', '.row--active', '.chip'].forEach((selector) => {
      cssRules(css, selector).forEach((rule) => {
        if (rule['box-shadow']) expect(rule['box-shadow'].startsWith('inset')).toBe(true);
      });
    });
  });
});

describe('Marked text', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');

  it('uses the accent and its readable contrast color in every browser, with a separate rule for Firefox', () => {
    ['::selection', '::-moz-selection'].forEach((selector) => {
      const rules = cssRules(css, selector);
      expect(rules).toHaveLength(1);
      expect(rules[0].background).toBe('var(--accent)');
      expect(rules[0].color).toBe('var(--accent-contrast)');
    });
    expect(css).not.toMatch(/::selection\s*,\s*::-moz-selection|::-moz-selection\s*,\s*::selection/);
  });
});

describe('Menu Icon Style on category icons', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');

  it('fills them all in the filled style', () => {
    const rules = cssRules(css, "html[data-icons='filled'] .odyIcon");
    expect(rules).toHaveLength(1);
    expect(rules[0].fill).toBe('currentColor');
  });

  it('fills them in the dynamic style only for the page, row or entry that is in use', () => {
    ['.entry--selected', '.entry--active', '.videoRow--active', '.layoutRow--active'].forEach((place) => {
      const rules = cssRules(css, `html[data-icons='dynamic'] ${place} .odyIcon`);
      expect(rules).toHaveLength(1);
      expect(rules[0].fill).toBe('currentColor');
    });
    expect(cssRules(css, "html[data-icons='dynamic'] .odyIcon")).toEqual([]);
    expect(cssRules(css, "html[data-icons='outlined'] .odyIcon")).toEqual([]);
  });
});

describe('Corners on the profile picture', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');

  it('is a circle with Round corners, square with Square and a squircle with Classic', () => {
    expect(cssRules(css, '.avatar')[0]['border-radius']).toBe('50%');
    expect(cssRules(css, "html[data-corners='square'] .avatar--corners")[0]['border-radius']).toBe('0');
    const classic = cssRules(css, "html[data-corners='classic'] .avatar--corners");
    expect(classic).toHaveLength(1);
    expect(classic[0]['border-radius']).toBe('0');
    expect(classic[0]['clip-path']).toBe('url(#squircle)');
    expect(classic[0]['will-change']).toBe('transform');
    expect(cssRules(css, "html[data-corners='round'] .avatar--corners")).toEqual([]);
  });

  it('keeps the colors of the photo on the light themes, where only the logo turns dark', () => {
    ['light', 'lighttinted'].forEach((theme) => expect(cssRules(css, `[data-theme='${theme}'] .sidebar__brand > img`)[0].filter).toBe('brightness(0)'));
    expect(cssRules(css, '.sidebar__brand img')).toEqual([]);
    expect(cssRules(css, '.sidebar__brand > img')[0]['border-radius']).toBe('var(--radius-md)');
  });

  it('hides the outline definitions without taking room', () => {
    const rules = cssRules(css, '.squircleDefs');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ position: 'absolute', width: '0', height: '0' });
  });
});
