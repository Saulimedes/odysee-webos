import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hoverOver } from '../../../tests/render';
import { LayoutEditor, visibleItems, type LayoutEntry } from '.';
import { arrange, isHidden, moveEntry, resetLayout, toggleEntry } from './model/layout';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const ids = (items: { id: string }[]) => items.map((item) => item.id);
const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

beforeEach(() => {
  resetLayout('home');
  resetLayout('sidebar');
  localStorage.clear();
});

describe('arrange and visibleItems', () => {
  it('keeps the original order without a layout', () => {
    expect(ids(arrange(items, { order: [], hidden: [], shown: [] }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts known ids first in their order and appends unknown ones in the original order', () => {
    expect(ids(arrange(items, { order: ['c', 'a', 'gone'], hidden: [], shown: [] }))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops hidden items but never locked ones', () => {
    const layout = { order: [], hidden: ['b', 'c'], shown: [] };
    expect(ids(visibleItems(items, layout))).toEqual(['a', 'd']);
    expect(ids(visibleItems(items, layout, ['c']))).toEqual(['a', 'c', 'd']);
  });

  it('keeps the entries that are hidden by default away until the user shows them', () => {
    const entries = [{ id: 'a' }, { id: 'open', hiddenByDefault: true }, { id: 'b' }];
    const layout = { order: [], hidden: [], shown: [] };
    expect(ids(visibleItems(entries, layout))).toEqual(['a', 'b']);
    expect(ids(visibleItems(entries, { ...layout, shown: ['open'] }))).toEqual(['a', 'open', 'b']);
    expect(ids(visibleItems(entries, { ...layout, hidden: ['open'] }))).toEqual(['a', 'b']);
    expect(ids(visibleItems(entries, { ...layout, hidden: ['a'], shown: ['open'] }))).toEqual(['open', 'b']);
    expect(isHidden(entries[1], layout)).toBe(true);
    expect(isHidden(entries[1], { ...layout, shown: ['open'] })).toBe(false);
    expect(isHidden(entries[0], { ...layout, hidden: ['a'] })).toBe(true);
  });
});

describe('layout storage', () => {
  it('saves moves and hidden items and removes the key on reset', () => {
    expect(moveEntry('home', ['a', 'b', 'c'], 'a', 1)).toBe(true);
    expect(stored('layout_home')).toEqual({ order: ['b', 'a', 'c'], hidden: [], shown: [] });
    toggleEntry('home', 'c');
    expect(stored('layout_home').hidden).toEqual(['c']);
    toggleEntry('home', 'c');
    expect(stored('layout_home').hidden).toEqual([]);
    expect(stored('layout_sidebar')).toBeNull();
    resetLayout('home');
    expect(localStorage.getItem('layout_home')).toBeNull();
  });

  it('saves the entries that are shown against their default apart, and forgets them on reset', () => {
    toggleEntry('home', 'open', true);
    expect(stored('layout_home')).toEqual({ order: [], hidden: [], shown: ['open'] });
    toggleEntry('home', 'open', true);
    expect(localStorage.getItem('layout_home')).toBeNull();
    toggleEntry('home', 'open', true);
    toggleEntry('home', 'b');
    expect(stored('layout_home')).toEqual({ order: [], hidden: ['b'], shown: ['open'] });
    resetLayout('home');
    expect(localStorage.getItem('layout_home')).toBeNull();
  });

  it('refuses moves past either end or of unknown entries', () => {
    expect(moveEntry('sidebar', ['a', 'b'], 'a', -1)).toBe(false);
    expect(moveEntry('sidebar', ['a', 'b'], 'b', 1)).toBe(false);
    expect(moveEntry('sidebar', ['a', 'b'], 'zzz', 1)).toBe(false);
    expect(localStorage.getItem('layout_sidebar')).toBeNull();
  });

  it('reads a saved layout on start and ignores broken ones', async () => {
    localStorage.setItem('layout_home', JSON.stringify({ order: ['x', 1, 'y'], hidden: 'nope' }));
    localStorage.setItem('layout_sidebar', '"garbage"');
    vi.resetModules();
    const module = await import('./model/layout');
    expect(render(<Probe kind="home" module={module} />).container.textContent).toBe('{"order":["x","y"],"hidden":[],"shown":[]}');
    expect(render(<Probe kind="sidebar" module={module} />).container.textContent).toBe('{"order":[],"hidden":[],"shown":[]}');
  });

  it('reads a layout that was saved before entries could be shown', async () => {
    localStorage.setItem('layout_home', JSON.stringify({ order: ['x'], hidden: ['y'] }));
    vi.resetModules();
    const module = await import('./model/layout');
    expect(render(<Probe kind="home" module={module} />).container.textContent).toBe('{"order":["x"],"hidden":["y"],"shown":[]}');
  });

  it('survives unreadable storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.resetModules();
    const module = await import('./model/layout');
    expect(render(<Probe kind="home" module={module} />).container.textContent).toBe('{"order":[],"hidden":[],"shown":[]}');
  });
});

function Probe({ kind, module }: { kind: 'home' | 'sidebar'; module: typeof import('./model/layout') }) {
  return <span>{JSON.stringify(module.useLayout(kind))}</span>;
}

describe('LayoutEditor', () => {
  const entries: LayoutEntry[] = [
    { id: 'a', label: 'Alpha', icon: <i /> },
    { id: 'b', label: 'Beta', note: 'Signed in only' },
    { id: 'c', label: 'Gamma', locked: true },
  ];
  const setup = () => {
    const onClose = vi.fn();
    render(<LayoutEditor kind="home" title="Edit rows" entries={entries} onClose={onClose} />);
    return onClose;
  };
  const labels = () => Array.from(document.querySelectorAll('.layoutRow__label')).map((node) => node.firstChild?.textContent);
  const state = () => document.querySelector('.layoutRow--active')?.textContent;

  it('closes with a click outside the panel and not with a click on it', () => {
    const onClose = setup();
    fireEvent.mouseDown(screen.getByText('Edit rows'));
    fireEvent.click(screen.getByText('Edit rows'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.querySelector('.picker') as HTMLElement);
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists the entries with their state and a reset row', () => {
    setup();
    expect(screen.getByText('Edit rows')).toBeInTheDocument();
    expect(labels()).toEqual(['Alpha', 'Beta', 'Gamma', 'Reset to default']);
    expect(screen.getByText('Signed in only')).toBeInTheDocument();
    expect(screen.getByText('Always shown')).toBeInTheDocument();
    expect(state()).toContain('Shown');
  });

  it('shows and hides entries with OK, but not locked ones', () => {
    setup();
    press(13);
    expect(state()).toContain('Hidden');
    expect(document.querySelector('.layoutRow--hidden')).not.toBeNull();
    expect(stored('layout_home').hidden).toEqual(['a']);
    press(13);
    expect(state()).toContain('Shown');
    press(40); press(40);
    press(13);
    expect(state()).toContain('Always shown');
    expect(stored('layout_home')?.hidden ?? []).toEqual([]);
  });

  it('lists an entry that is hidden by default as hidden, and shows it with OK', () => {
    render(<LayoutEditor kind="home" title="Edit rows" entries={[{ id: 'a', label: 'Alpha' }, { id: 'open', label: 'Open', hiddenByDefault: true }]} onClose={vi.fn()} />);
    press(40);
    expect(state()).toContain('Hidden');
    expect(document.querySelector('.layoutRow--hidden')).not.toBeNull();
    press(13);
    expect(state()).toContain('Shown');
    expect(document.querySelector('.layoutRow--hidden')).toBeNull();
    expect(stored('layout_home')).toEqual({ order: [], hidden: [], shown: ['open'] });
    press(13);
    expect(state()).toContain('Hidden');
    expect(localStorage.getItem('layout_home')).toBeNull();
  });

  it('picks a row up, moves it and drops it again', () => {
    setup();
    press(39);
    expect(document.querySelector('.layoutRow--moving')).not.toBeNull();
    expect(screen.getByText(/Up and Down move the row/)).toBeInTheDocument();
    press(40);
    expect(labels().slice(0, 3)).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(document.querySelector('.layoutRow--active .layoutRow__label')?.firstChild?.textContent).toBe('Alpha');
    press(40);
    press(40);
    expect(labels().slice(0, 3)).toEqual(['Beta', 'Gamma', 'Alpha']);
    press(40);
    press(38); press(38); press(38);
    expect(labels().slice(0, 3)).toEqual(['Alpha', 'Beta', 'Gamma']);
    press(13);
    expect(document.querySelector('.layoutRow--moving')).toBeNull();
    press(39);
    press(39);
    expect(document.querySelector('.layoutRow--moving')).toBeNull();
    expect(stored('layout_home').order).toEqual(['a', 'b', 'c']);
  });

  it('drops a picked up row with Back or Left before closing', () => {
    const onClose = setup();
    press(39);
    press(461);
    expect(document.querySelector('.layoutRow--moving')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    press(39);
    press(37);
    expect(onClose).not.toHaveBeenCalled();
    press(461);
    expect(onClose).toHaveBeenCalledTimes(1);
    press(27);
    press(8);
    press(37);
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('resets to the default from the last row', () => {
    setup();
    press(13);
    press(39);
    press(40);
    press(13);
    expect(labels().slice(0, 3)).toEqual(['Beta', 'Alpha', 'Gamma']);
    press(40); press(40);
    expect(state()).toContain('Reset to default');
    press(39);
    expect(document.querySelector('.layoutRow--moving')).toBeNull();
    press(13);
    expect(labels().slice(0, 3)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(localStorage.getItem('layout_home')).toBeNull();
    expect(state()).toContain('Shown');
  });

  it('points at the row under the cursor, but not while a row is picked up', () => {
    setup();
    hoverOver(screen.getByText('Beta'));
    expect(state()).toContain('Beta');
    hoverOver(screen.getByText('Reset to default'));
    expect(state()).toContain('Reset to default');
    hoverOver(screen.getByText('Alpha'));
    press(39);
    expect(document.querySelector('.layoutRow--moving')).not.toBeNull();
    hoverOver(screen.getByText('Gamma'));
    expect(state()).toContain('Alpha');
    press(13);
    hoverOver(screen.getByText('Gamma'));
    expect(state()).toContain('Gamma');
  });

  it('works with clicks and swallows other keys', () => {
    setup();
    fireEvent.click(screen.getByText('Beta'));
    expect(stored('layout_home').hidden).toEqual(['b']);
    fireEvent.click(screen.getByText('Reset to default'));
    expect(localStorage.getItem('layout_home')).toBeNull();
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(false);
  });

  it('goes round when browsing and stays in bounds when moving', () => {
    setup();
    press(38);
    expect(state()).toContain('Reset');
    press(40);
    expect(state()).toContain('Alpha');
    press(39);
    press(38);
    expect(labels().slice(0, 3)).toEqual(['Alpha', 'Beta', 'Gamma']);
    press(13);
    press(40); press(40); press(40);
    expect(state()).toContain('Reset');
    press(40);
    expect(state()).toContain('Alpha');
  });

  it('does not carry an entry over the end of the list while moving it', () => {
    setup();
    press(13);
    press(39);
    for (let index = 0; index < 6; index++) press(40);
    expect(labels().slice(0, 3)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(document.querySelector('.layoutRow--moving')?.textContent).toContain('Alpha');
    press(38); press(38); press(38); press(38);
    expect(labels().slice(0, 3)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('LayoutEditor option', () => {
  const entries: LayoutEntry[] = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];

  it('shows a switch below the entries that OK and clicks flip', () => {
    const onToggle = vi.fn();
    const view = render(<LayoutEditor kind="home" title="Edit" entries={entries} option={{ label: 'Also use for the menu', checked: false, onToggle }} onClose={vi.fn()} />);
    expect(screen.getByText('Also use for the menu')).toBeInTheDocument();
    expect(document.querySelector('.switch--on')).toBeNull();
    press(40); press(40);
    expect(document.querySelector('.layoutRow--active')?.textContent).toBe('Also use for the menu');
    press(13);
    expect(onToggle).toHaveBeenCalledTimes(1);
    press(39);
    expect(document.querySelector('.layoutRow--moving')).toBeNull();
    fireEvent.click(screen.getByText('Also use for the menu'));
    expect(onToggle).toHaveBeenCalledTimes(2);
    view.rerender(<LayoutEditor kind="home" title="Edit" entries={entries} option={{ label: 'Also use for the menu', checked: true, onToggle }} onClose={vi.fn()} />);
    expect(document.querySelector('.switch--on')).not.toBeNull();
    press(40);
    expect(document.querySelector('.layoutRow--active')?.textContent).toBe('Reset to default');
  });

  it('is left out when there is no option', () => {
    render(<LayoutEditor kind="home" title="Edit" entries={entries} onClose={vi.fn()} />);
    expect(document.querySelector('.layoutRow--option')).toBeNull();
  });
});

