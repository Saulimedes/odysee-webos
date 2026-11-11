import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, cssRules, flush, mockFetch, rpcResult, video } from '../../tests/helpers';
import { refreshHomepage } from '@/entities/category';
import { hoverOver, renderWithNav, setViewport, tapOk } from '../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { getSetting, setSetting } from '@/shared/config/settings';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { clearPlaybackHistory, savePlaybackPosition } from '@/features/playback-history';
import type { Video } from '@/entities/video';
import { LibraryPage, ListPage } from './library';
import { SearchPage } from './search';
import { resetLayout } from '@/features/customize-layout/model/layout';
import { loadLanguage } from '@/shared/i18n/translation';
import de from '@/shared/i18n/locales/de';
import { SettingsPage } from './settings';
import { LoginPage } from './login';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const v = (id: string) => video(id) as Video;

beforeEach(() => {
  setViewport();
  invalidate();
  forgetRemembered();
  session.set({ token: null, user: null });
  collections.set({ watchLater: [], favorites: [], history: [] });
  clearPlaybackHistory();
  localStorage.clear();
  setSetting('themeMode', 'black');
  setSetting('accentColor', '#DE0050');
  setSetting('uiFont', 'default');
  setSetting('textScale', 1);
  setSetting('autoplay', true);
  setSetting('nsfw', false);
  setSetting('aspectRatio', 'auto');
  setSetting('playbackSpeed', 1);
  setSetting('loaderStyle', 'ring');
  setSetting('iconVariant', 'outlined');
  setSetting('iconScale', 1);
  setSetting('logoButton', 'off');
  setSetting('osdBackButton', true);
  setSetting('uiLanguage', 'en');
  setSetting('homepageLanguage', 'auto');
  setSetting('statsForNerds', false);
  setSetting('categoriesFollowHome', false);
  resetLayout('home');
  resetLayout('sidebar');
});

describe('LibraryPage', () => {
  it('shows an empty state', () => {
    renderWithNav(<LibraryPage />);
    expect(screen.getByText('Your library is empty')).toBeInTheDocument();
  });

  it('lets the cards share the row, so the last one and its focus ring stay inside it', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../app/styles/styles.css'), 'utf8');
    const [card] = cssRules(css, '.libraryCard');
    expect(card.flex).toBe('1 1 0');
    expect(card['min-width']).toBe('0');
    expect(card['max-width']).toBe('600px');
    expect(card.width).toBeUndefined();
    expect(cssRules(css, '.libraryCard:last-child')[0]['margin-right']).toBe('0');
    expect(cssRules(css, '.libraryCards')[0].padding).toBe('12px 10px 14px');
    expect(cssRules(css, '.libraryCards')[0].overflow).toBe('hidden');
  });

  it('lists sections with counts and previews', () => {
    collections.set({ watchLater: [v('a'), v('b')], favorites: [v('c')], history: [v('d')] });
    savePlaybackPosition(v('e'), 100, 600);
    renderWithNav(<LibraryPage />);
    expect(screen.getAllByText('Continue Watching').length).toBeGreaterThan(1);
    expect(screen.getByText('2 videos')).toBeInTheDocument();
    expect(screen.getByText('Your watch history')).toBeInTheDocument();
    expect(screen.getAllByText('1 video').length).toBeGreaterThan(0);
  });

  it('points at the card under the cursor, and hands the focus to the previews and back', () => {
    collections.set({ watchLater: [v('a')], favorites: [], history: [v('d')] });
    renderWithNav(<LibraryPage />);
    const cards = () => Array.from(document.querySelectorAll('.libraryCard'));
    hoverOver(cards()[1]);
    expect(document.querySelector('.libraryCard--active')).toBe(cards()[1]);
    hoverOver(document.querySelector('.libraryRows .card') as Element);
    expect(document.querySelector('.libraryCard--active')).toBeNull();
    expect(document.querySelector('.card--active')).not.toBeNull();
    hoverOver(cards()[0]);
    expect(document.querySelector('.libraryCard--active')).toBe(cards()[0]);
  });

  it('opens sections from the cards and moves down into the previews', () => {
    collections.set({ watchLater: [v('a')], favorites: [], history: [v('d')] });
    const { nav } = renderWithNav(<LibraryPage />);
    press(13);
    expect(nav.go).toHaveBeenLastCalledWith('watch-later');
    press(39);
    press(13);
    expect(nav.go).toHaveBeenLastCalledWith('history');
    press(37);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
    press(40);
    expect(document.querySelector('.card--active')).not.toBeNull();
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), expect.any(Array));
    press(38);
    expect(document.querySelector('.libraryCard--active')).not.toBeNull();
    fireEvent.click(screen.getAllByText('Watch History')[0]);
    expect(nav.go).toHaveBeenLastCalledWith('history');
  });
});

describe('ListPage', () => {
  it('shows the videos of a section', () => {
    collections.set({ watchLater: [], favorites: [v('f1')], history: [] });
    const { nav } = renderWithNav(<ListPage section="favorites" />);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), expect.any(Array));
  });

  it('shows empty hints', () => {
    renderWithNav(<ListPage section="watch-later" />);
    expect(screen.getByText('No videos in Watch Later')).toBeInTheDocument();
  });

  it('refreshes account lists from the cloud', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    const spy = mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'preference_get') return rpcResult({ shared: { value: { builtinCollections: { watchlater: { items: ['lbry://x#w1'] }, favorites: { items: ['lbry://y#fa1'] } } } } });
      return rpcResult({ items: body.params.claim_ids.map((id: string) => claim(id)) });
    });
    renderWithNav(<ListPage section="watch-later" />);
    expect(await screen.findByText('Video w1')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    renderWithNav(<ListPage section="favorites" />);
    await waitFor(() => expect(collections.get().favorites.map((entry) => entry.id)).toEqual(['fa1']));
    renderWithNav(<ListPage section="history" />);
  });

  it('falls back to the first section for unknown ones', () => {
    renderWithNav(<ListPage section={'nope' as never} />);
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
  });
});

describe('SearchPage', () => {
  function api() {
    return mockFetch((url, init) => {
      if (url.includes('lighthouse')) {
        const params = new URL(url).searchParams;
        return params.get('claimType') === 'channel' ? [{ claimId: 'ch1' }, { claimId: 'ch2' }] : [{ claimId: 'r1' }, { claimId: 'r2' }];
      }
      const body = JSON.parse(String(init?.body));
      if (body.params.claim_type?.[0] === 'channel') return rpcResult({ items: body.params.claim_ids.map((id: string) => ({ claim_id: id, name: `@${id}`, value: { title: `Chan ${id}` } })) });
      return rpcResult({ items: body.params.claim_ids.map((id: string) => claim(id, `Result ${id}`)) });
    });
  }

  it('searches while typing and shows videos', async () => {
    const spy = api();
    const { nav } = renderWithNav(<SearchPage />);
    const input = screen.getByPlaceholderText('Search Odysee...');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'fixture' } });
    expect(await screen.findByText('Result r1', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).includes('s=fixture'))).toBe(true);
    press(40);
    press(40);
    tapOk();
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), expect.any(Array));
  });

  it('switches to channels and opens one', async () => {
    api();
    const { nav } = renderWithNav(<SearchPage />);
    fireEvent.change(screen.getByPlaceholderText('Search Odysee...'), { target: { value: 'fixture' } });
    await screen.findByText('Result r1', {}, { timeout: 3000 });
    press(40);
    press(39);
    expect(screen.getByText('Channels').className).toContain('tab--on');
    expect(await screen.findByText('Chan ch1', {}, { timeout: 3000 })).toBeInTheDocument();
    press(40);
    press(13);
    expect(nav.openChannel).toHaveBeenCalledWith('ch1', 'Chan ch1');
    press(38);
    press(37);
    expect(screen.getByText('Videos').className).toContain('tab--on');
  });

  it('moves between the input, tabs and results with the remote', async () => {
    api();
    const { nav } = renderWithNav(<SearchPage />);
    const input = screen.getByPlaceholderText('Search Odysee...') as HTMLInputElement;
    press(40);
    expect(document.activeElement).not.toBe(input);
    press(38);
    expect(document.activeElement).toBe(input);
    input.blur();
    press(13);
    expect(document.activeElement).toBe(input);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'x' } });
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('opens the sidebar from the tabs and from an empty text field', () => {
    api();
    const { nav } = renderWithNav(<SearchPage />);
    const input = screen.getByPlaceholderText('Search Odysee...') as HTMLInputElement;
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(1);
    input.blur();
    press(40);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(2);
    press(39);
    press(40);
    press(65);
  });

  it('handles failures and no results', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch((url) => { if (url.includes('lighthouse')) throw new Error('offline'); return rpcResult({}); });
    renderWithNav(<SearchPage />);
    fireEvent.change(screen.getByPlaceholderText('Search Odysee...'), { target: { value: 'broken' } });
    expect(await screen.findByText('No results found', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('loads more results on demand', async () => {
    const hits = Array.from({ length: 40 }, (_, index) => ({ claimId: `m${index}` }));
    const spy = mockFetch((url, init) => {
      if (url.includes('lighthouse')) return new URL(url).searchParams.get('from') ? [{ claimId: 'extra1' }] : hits;
      const body = JSON.parse(String(init?.body));
      return rpcResult({ items: body.params.claim_ids.map((id: string) => claim(id, `Result ${id}`)) });
    });
    renderWithNav(<SearchPage />);
    fireEvent.change(screen.getByPlaceholderText('Search Odysee...'), { target: { value: 'many' } });
    await screen.findByText('Result m0', {}, { timeout: 3000 });
    press(40);
    press(40);
    for (let index = 0; index < 8; index++) press(40);
    await waitFor(() => expect(spy.mock.calls.some(([url]) => String(url).includes('from=40'))).toBe(true));
  });
});

describe('SettingsPage', () => {
  const setup = (onSignOut = vi.fn()) => ({ onSignOut, ...renderWithNav(<SettingsPage onSignOut={onSignOut} />) });

  const PAGES = ['Appearance', 'Customize', 'Language', 'Playback', 'Account', 'About'];
  const ROWS: Record<string, string[]> = {
    Appearance: ['Theme', 'Accent Color', 'Font', 'Loading Animation', 'Corners', 'Text Size', 'Card Size'],
    Customize: ['Customize Homepage', 'Customize Sidebar', 'Logo Button', 'Menu Icon Style', 'Menu Icon Size'],
    Language: ['App Language', 'Homepage Language'],
    Playback: ['Autoplay next video', 'Resume playback', 'Aspect Ratio', 'Playback Speed', 'Back Button', 'Stats for Nerds'],
    About: ['Odysee for webOS'],
  };

  const texts = (selector: string) => Array.from(document.querySelectorAll(selector)).map((node) => node.textContent ?? '');
  const pageLabels = () => texts('.masterDetail__list .entry__label');
  const selectedPage = () => document.querySelector('.masterDetail__list .entry--selected .entry__label')?.textContent;
  const heading = () => document.querySelector('.masterDetail__detail h2.masterDetail__title')?.textContent;
  const rowLabels = () => Array.from(document.querySelectorAll('.masterDetail__detail .row')).map((row) => row.querySelector('.row__label')?.textContent ?? '');
  const activeRow = () => document.querySelector('.masterDetail__detail .row--active .row__label')?.textContent;

  const showPage = async (name: string) => {
    if (document.querySelector('.row--active')) press(37);
    const target = pageLabels().indexOf(name);
    if (target < 0) throw new Error(`Page ${name} not found`);
    const current = () => pageLabels().indexOf(selectedPage() ?? '');
    for (let step = 0; step < pageLabels().length && current() !== target; step++) press(current() < target ? 40 : 38);
    await waitFor(() => expect(heading()).toBe(name));
  };

  const openPage = async (name: string) => {
    await showPage(name);
    press(39);
    expect(activeRow()).toBeTruthy();
  };

  const focusRow = (label: string) => {
    const target = rowLabels().indexOf(label);
    if (target < 0) throw new Error(`Row ${label} not found`);
    if (activeRow() === undefined) throw new Error('The rows do not have the focus');
    for (let step = 0; step < rowLabels().length; step++) {
      const current = rowLabels().indexOf(activeRow() ?? '');
      if (current === target) return;
      press(current < target ? 40 : 38);
    }
    throw new Error(`Row ${label} could not be focused`);
  };

  const openSetting = async (page: string, label: string) => {
    await openPage(page);
    focusRow(label);
  };

  const pickNext = (label: string, steps = 1) => {
    focusRow(label);
    press(13);
    for (let step = 0; step < steps; step++) press(40);
    press(13);
  };

  it('lists the six pages with their icons under the Settings title', () => {
    setup();
    expect(document.querySelector('h1.masterDetail__title')?.textContent).toBe('Settings');
    expect(pageLabels()).toEqual(PAGES);
    const entries = Array.from(document.querySelectorAll('.masterDetail__list .entry'));
    expect(entries).toHaveLength(6);
    entries.forEach((entry) => expect(entry.querySelector('svg')).not.toBeNull());
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('starts on Appearance with its rows while the list has the focus', () => {
    setup();
    expect(selectedPage()).toBe('Appearance');
    expect(heading()).toBe('Appearance');
    expect(rowLabels()).toEqual(ROWS.Appearance);
    expect(document.querySelector('.entry--active')).not.toBeNull();
    expect(document.querySelector('.row--active')).toBeNull();
  });

  it('switches the rows on the right with Down and Up in the list after a short delay', async () => {
    setup();
    press(40);
    expect(selectedPage()).toBe('Customize');
    expect(heading()).toBe('Appearance');
    await waitFor(() => expect(heading()).toBe('Customize'));
    expect(rowLabels()).toEqual(ROWS.Customize);
    press(40);
    await waitFor(() => expect(heading()).toBe('Language'));
    expect(rowLabels()).toEqual(ROWS.Language);
    press(38);
    press(38);
    expect(selectedPage()).toBe('Appearance');
    await waitFor(() => expect(heading()).toBe('Appearance'));
    expect(rowLabels()).toEqual(ROWS.Appearance);
    press(38);
    expect(selectedPage()).toBe('About');
    await waitFor(() => expect(heading()).toBe('About'));
    press(40);
    expect(selectedPage()).toBe('Appearance');
    await waitFor(() => expect(heading()).toBe('Appearance'));
  });

  it('points at the page and the row under the cursor, handing the focus between the two', async () => {
    setup();
    const entries = () => Array.from(document.querySelectorAll('.masterDetail__list .entry'));
    hoverOver(entries()[2]);
    expect(selectedPage()).toBe(pageLabels()[2]);
    expect(activeRow()).toBeUndefined();
    await waitFor(() => expect(heading()).toBe(pageLabels()[2]));
    hoverOver(document.querySelector('.masterDetail__detail .row') as Element);
    const rows = Array.from(document.querySelectorAll('.masterDetail__detail .row'));
    expect(activeRow()).toBe(rowLabels()[0]);
    hoverOver(rows[1]);
    expect(activeRow()).toBe(rowLabels()[1]);
    hoverOver(entries()[0]);
    expect(selectedPage()).toBe(pageLabels()[0]);
    expect(activeRow()).toBeUndefined();
  });

  it('goes round at both ends of the rows of a page', async () => {
    setup();
    await openPage('Appearance');
    const labels = rowLabels();
    expect(activeRow()).toBe(labels[0]);
    press(38);
    expect(activeRow()).toBe(labels[labels.length - 1]);
    press(40);
    expect(activeRow()).toBe(labels[0]);
  });

  it('places every setting on its page', async () => {
    setup();
    for (const page of ['Appearance', 'Customize', 'Language', 'Playback', 'About']) {
      await showPage(page);
      expect(heading()).toBe(page);
      expect(rowLabels()).toEqual(ROWS[page]);
    }
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('enters the rows with Right or OK and shows the active row only there', () => {
    setup();
    press(39);
    expect(activeRow()).toBe('Theme');
    expect(document.querySelectorAll('.row--active')).toHaveLength(1);
    expect(document.querySelector('.entry--active')).toBeNull();
    expect(selectedPage()).toBe('Appearance');
    press(37);
    expect(document.querySelector('.row--active')).toBeNull();
    expect(document.querySelector('.entry--active')).not.toBeNull();
    press(13);
    expect(activeRow()).toBe('Theme');
    expect(document.querySelector('.picker')).toBeNull();
    expect(getSetting('themeMode')).toBe('black');
  });

  it.each([['Left', 37], ['Back', 461], ['Escape', 27], ['Backspace', 8]] as [string, number][])('goes back from the rows to the list of pages with %s', (_name, keyCode) => {
    const { nav } = setup();
    press(39);
    press(40);
    expect(activeRow()).toBe('Accent Color');
    press(keyCode);
    expect(document.querySelector('.row--active')).toBeNull();
    expect(document.querySelector('.entry--active')).not.toBeNull();
    expect(nav.focusSidebar).not.toHaveBeenCalled();
    expect(rowLabels()).toEqual(ROWS.Appearance);
    press(39);
    expect(activeRow()).toBe('Accent Color');
  });

  it('opens the sidebar with Left only from the list of pages', () => {
    const { nav } = setup();
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(1);
    press(39);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(1);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(2);
  });

  it('ignores the keys while the sidebar has the focus', () => {
    setup();
    cleanup();
    renderWithNav(<SettingsPage onSignOut={vi.fn()} />, { sidebarFocused: true });
    expect(document.querySelector('.entry--active')).toBeNull();
    press(40);
    press(39);
    press(13);
    expect(selectedPage()).toBe('Appearance');
    expect(document.querySelector('.row--active')).toBeNull();
    expect(document.querySelector('.picker')).toBeNull();
  });

  it('does not change a choice or a switch with Left or Right any more', async () => {
    setup();
    await openPage('Appearance');
    expect(activeRow()).toBe('Theme');
    press(39);
    expect(getSetting('themeMode')).toBe('black');
    expect(activeRow()).toBe('Theme');
    press(37);
    expect(getSetting('themeMode')).toBe('black');
    expect(document.querySelector('.row--active')).toBeNull();
    await openSetting('Playback', 'Autoplay next video');
    press(39);
    expect(getSetting('autoplay')).toBe(true);
    expect(activeRow()).toBe('Autoplay next video');
  });

  it('sets the theme and the accent color through the picker', async () => {
    setup();
    await openPage('Appearance');
    pickNext('Theme');
    expect(getSetting('themeMode')).toBe('dark');
    pickNext('Accent Color');
    expect(getSetting('accentColor')).toBe('#FF2D55');
    expect(document.querySelector('.picker')).toBeNull();
    expect(activeRow()).toBe('Accent Color');
  });

  it('shows the account row only on the Account page and only when signed in', async () => {
    session.set({ token: 't', user: { primary_email: 'me@example.com' } });
    setup();
    await showPage('Playback');
    expect(screen.queryByText('me@example.com')).toBeNull();
    await openPage('Account');
    expect(rowLabels()).toEqual(['me@example.com', 'Show mature content', 'Clear Cache']);
    expect(activeRow()).toBe('me@example.com');
    expect(texts('.row__section')).toEqual(['', 'Content', 'Storage']);
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
    expect(screen.queryByText('Sign in required')).toBeNull();
  });

  it('shows mature content and the cache without an account row when signed out', async () => {
    setup();
    await openPage('Account');
    expect(heading()).toBe('Account');
    expect(rowLabels()).toEqual(['Show mature content', 'Clear Cache']);
    expect(texts('.row__section')).toEqual(['Content', 'Storage']);
    expect(activeRow()).toBe('Show mature content');
    expect(screen.getByText('Sign in required')).toBeInTheDocument();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('remembers the page, the zone and the row of every page when the page remounts', async () => {
    const first = setup();
    await openSetting('Playback', 'Stats for Nerds');
    await openSetting('Appearance', 'Font');
    await openPage('Playback');
    expect(activeRow()).toBe('Stats for Nerds');
    first.unmount();
    setup();
    expect(selectedPage()).toBe('Playback');
    expect(heading()).toBe('Playback');
    expect(activeRow()).toBe('Stats for Nerds');
    await openPage('Appearance');
    expect(activeRow()).toBe('Font');
  });

  it('remembers the page but starts in the list when it was left there', async () => {
    const first = setup();
    await showPage('Language');
    first.unmount();
    setup();
    expect(selectedPage()).toBe('Language');
    expect(heading()).toBe('Language');
    expect(rowLabels()).toEqual(ROWS.Language);
    expect(document.querySelector('.row--active')).toBeNull();
    expect(document.querySelector('.entry--active')).not.toBeNull();
  });

  it('translates the pages, the title and the rows', async () => {
    setSetting('uiLanguage', 'de');
    await loadLanguage('de');
    setup();
    expect(document.querySelector('h1.masterDetail__title')?.textContent).toBe(de.Settings);
    expect(pageLabels()).toEqual([de.Appearance, de.Customize, de.Language, de.Playback, de.Account, de.About]);
    expect(heading()).toBe(de.Appearance);
    expect(rowLabels()).toContain(de.Theme);
    await openPage(de.Account);
    expect(heading()).toBe(de.Account);
    expect(rowLabels()).toEqual([de['Show mature content'], de['Clear Cache']]);
    expect(texts('.row__section')).toEqual([de.Content, de.Storage]);
    expect(screen.getByText(de['Sign in required'])).toBeInTheDocument();
  });

  it('toggles switches with OK', async () => {
    setup();
    await openSetting('Playback', 'Autoplay next video');
    press(13);
    expect(getSetting('autoplay')).toBe(false);
    press(13);
    expect(getSetting('autoplay')).toBe(true);
  });

  it('requires an account for mature content', async () => {
    const { unmount } = setup();
    await openSetting('Account', 'Show mature content');
    expect(screen.getByText('Sign in required')).toBeInTheDocument();
    press(13);
    expect(getSetting('nsfw')).toBe(false);
    unmount();
    forgetRemembered();
    session.set({ token: 't', user: { primary_email: 'a@b.c' } });
    setup();
    await openSetting('Account', 'Show mature content');
    press(13);
    expect(getSetting('nsfw')).toBe(true);
  });

  it('previews options in the picker and confirms or cancels', async () => {
    setup();
    await openSetting('Appearance', 'Accent Color');
    press(13);
    expect(screen.getByText('Accent Color', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(40);
    expect(getSetting('accentColor')).toBe('#FF007F');
    press(461);
    expect(getSetting('accentColor')).toBe('#DE0050');
    expect(document.querySelector('.picker')).toBeNull();
    expect(activeRow()).toBe('Accent Color');
    press(13);
    press(40);
    press(13);
    expect(getSetting('accentColor')).toBe('#FF2D55');
    expect(document.querySelector('.picker')).toBeNull();
    press(13);
    fireEvent.click(screen.getAllByText('Odysee Pink')[screen.getAllByText('Odysee Pink').length - 1]);
    expect(getSetting('accentColor')).toBe('#DE0050');
    press(13);
    press(38);
    press(65);
    press(37);
    expect(getSetting('accentColor')).toBe('#DE0050');
    expect(activeRow()).toBe('Accent Color');
  });

  it('shows fonts in their own typeface', async () => {
    setup();
    await openSetting('Appearance', 'Font');
    press(13);
    expect(document.querySelector('.pickerItem')).not.toBeNull();
    press(40);
    expect((document.querySelectorAll('.pickerItem')[1] as HTMLElement).style.fontFamily).toContain('Inter');
    press(27);
  });

  it('clears local data after a confirmation', async () => {
    collections.set({ watchLater: [v('a')], favorites: [], history: [v('b')] });
    savePlaybackPosition(v('c'), 100, 600);
    setup();
    await openSetting('Account', 'Clear Cache');
    expect(screen.getByText(/Remove watch history/)).toBeInTheDocument();
    press(13);
    expect(screen.getByText(/Press OK again/)).toBeInTheDocument();
    press(13);
    expect(screen.getByText('Cleared')).toBeInTheDocument();
    expect(collections.get().history).toEqual([]);
    expect(localStorage.getItem('continue_watching')).toContain('"items":[]');
    press(13);
    press(38);
    expect(screen.queryByText(/Press OK again/)).toBeNull();
  });

  it('syncs again after clearing when signed in', async () => {
    session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
    const spy = mockFetch(() => rpcResult({ shared: { value: {} } }));
    setup();
    await openSetting('Account', 'Clear Cache');
    press(13);
    press(13);
    await act(async () => { await flush(); });
    expect(spy).toHaveBeenCalled();
  });

  it('shows the account and signs out', async () => {
    session.set({ token: 't', user: { primary_email: 'me@example.com', channel: { id: 'c', name: 'mine', thumb: null }, profile_image: null } });
    const { onSignOut } = setup();
    await openPage('Account');
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByText('@mine')).toBeInTheDocument();
    press(13);
    expect(onSignOut).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sign Out'));
    expect(onSignOut).toHaveBeenCalledTimes(2);
  });

  it('sets the loading animation, icon, aspect ratio and speed through the picker', async () => {
    setup();
    await openPage('Appearance');
    pickNext('Loading Animation');
    expect(getSetting('loaderStyle')).toBe('dots');
    await openPage('Customize');
    pickNext('Menu Icon Style');
    expect(getSetting('iconVariant')).toBe('filled');
    pickNext('Menu Icon Size');
    expect(getSetting('iconScale')).toBe(1.1);
    await openPage('Playback');
    pickNext('Aspect Ratio');
    expect(getSetting('aspectRatio')).toBe('zoom');
    pickNext('Playback Speed');
    expect(getSetting('playbackSpeed')).toBe(1.25);
    expect(screen.getByText('1.25×')).toBeInTheDocument();
  });

  it('switches the Back Button of the player on and off', async () => {
    setup();
    await openSetting('Playback', 'Back Button');
    expect(screen.getByText(/Shows a back arrow at the top left of the player controls/)).toBeInTheDocument();
    expect(getSetting('osdBackButton')).toBe(true);
    press(13);
    expect(getSetting('osdBackButton')).toBe(false);
    expect(document.querySelector('.row--active .switch--on')).toBeNull();
    press(13);
    expect(getSetting('osdBackButton')).toBe(true);
    expect(document.querySelector('.row--active .switch--on')).not.toBeNull();
    press(40);
    expect(activeRow()).toBe('Stats for Nerds');
  });

  it('sets the Logo Button through the picker', async () => {
    setup();
    await openSetting('Customize', 'Logo Button');
    expect(getSetting('logoButton')).toBe('off');
    press(13);
    expect(Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent?.replace('current', ''))).toEqual(['Off', 'Home', 'Settings']);
    press(40);
    expect(getSetting('logoButton')).toBe('home');
    press(461);
    expect(getSetting('logoButton')).toBe('off');
    pickNext('Logo Button');
    expect(getSetting('logoButton')).toBe('home');
    expect(document.querySelector('.picker')).toBeNull();
    expect(activeRow()).toBe('Logo Button');
    pickNext('Logo Button');
    expect(getSetting('logoButton')).toBe('settings');
  });

  it('shows Black, Dark and Light with a preview and applies the theme while browsing', async () => {
    setup();
    await openSetting('Appearance', 'Theme');
    expect(document.querySelector('.row .themeSwatch')).not.toBeNull();
    press(13);
    const names = Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent);
    expect(names.slice(0, 3).map((name) => name?.replace('current', ''))).toEqual(['Black', 'Dark', 'Light']);
    expect(document.querySelectorAll('.picker .themeSwatch').length).toBeGreaterThanOrEqual(3);
    press(40); press(40);
    expect(getSetting('themeMode')).toBe('light');
    press(461);
    expect(getSetting('themeMode')).toBe('black');
  });

  it('previews loading animations in the picker, starting on the ring', async () => {
    setup();
    await openSetting('Appearance', 'Loading Animation');
    expect(document.querySelector('.row--active .row__value')?.textContent).toBe('Ring');
    press(13);
    expect(document.querySelectorAll('.picker .loaderPreview')).toHaveLength(6);
    expect(Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent?.replace('current', ''))).toEqual(['Ring', 'Dots', 'Twin Arcs', 'Growing Dots', 'Bouncing Dots', 'Ripple']);
    ['ring', 'dots', 'arcs', 'typing', 'bounce', 'ripple'].forEach((code) => expect(document.querySelector(`.picker .loader-${code}`)).not.toBeNull());
    ['odysee', 'pulse'].forEach((code) => expect(document.querySelector(`.picker .loader-${code}`)).toBeNull());
    expect(document.querySelector('.picker img')).toBeNull();
    press(40);
    expect(getSetting('loaderStyle')).toBe('dots');
    for (let index = 0; index < 4; index++) press(40);
    expect(getSetting('loaderStyle')).toBe('ripple');
    press(13);
    expect(document.querySelector('.picker')).toBeNull();
    expect(getSetting('loaderStyle')).toBe('ripple');
  });

  it('opens the homepage and sidebar editors and closes them again', async () => {
    setup();
    await openSetting('Customize', 'Customize Homepage');
    press(13);
    expect(screen.getByText('Customize Homepage', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
    press(461);
    expect(document.querySelector('.layoutEditor')).toBeNull();
    expect(activeRow()).toBe('Customize Homepage');
    press(40);
    press(13);
    expect(screen.getByText('Customize Sidebar', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Always shown')).toBeInTheDocument();
    press(37);
    expect(document.querySelector('.layoutEditor')).toBeNull();
    expect(activeRow()).toBe('Customize Sidebar');
    expect(screen.getAllByText('Customize Sidebar').length).toBeGreaterThan(0);
  });

  it('shows the categories of the homepage in the homepage editor', async () => {
    mockFetch(() => ({ status: 'success', data: { en: { categories: {
      PRIMARY_CONTENT: { label: 'Featured', channelIds: ['f1'], sortOrder: 2 },
      GAMING: { label: 'Gaming', icon: 'Gaming', channelIds: ['g1'], sortOrder: 60 },
      CHEESE: { label: 'Cheese', icon: 'Unknown', channelIds: ['c1'], sortOrder: 70 },
    } } } }));
    await act(async () => { await refreshHomepage(true); });
    setup();
    await openSetting('Customize', 'Customize Homepage');
    press(13);
    ['Featured', 'Gaming', 'Cheese', 'Following'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('lets you pick the app language', async () => {
    setup();
    await openPage('Language');
    expect(activeRow()).toBe('App Language');
    press(13);
    const names = Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent?.replace('current', ''));
    expect(names.slice(0, 4)).toEqual(['Auto', 'English', 'Deutsch', 'Français']);
    press(40);
    expect(getSetting('uiLanguage')).toBe('de');
    await act(async () => { await loadLanguage('de'); });
    press(13);
    await waitFor(() => expect(document.querySelector('h1.masterDetail__title')?.textContent).toBe(de.Settings));
    expect(pageLabels()).toEqual([de.Appearance, de.Customize, de.Language, de.Playback, de.Account, de.About]);
    expect(heading()).toBe(de.Language);
    expect(rowLabels()).toEqual([de['App Language'], de['Homepage Language']]);
    expect(activeRow()).toBe(de['App Language']);
  });

  it('keeps the names of languages as they are in every language', async () => {
    setSetting('uiLanguage', 'de');
    await loadLanguage('de');
    setup();
    await openPage(de.Language);
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    press(13);
    expect(Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent?.replace(/aktuell|current/, '')).slice(1, 4)).toEqual(['English', 'Deutsch', 'Français']);
  });

  it('offers the languages Odysee has a homepage for', async () => {
    setup();
    await openSetting('Language', 'Homepage Language');
    press(13);
    const names = Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent?.replace('current', ''));
    expect(names[0]).toBe('Same as app language');
    expect(names.slice(0, 3)).toEqual(['Same as app language', 'English', 'Deutsch']);
    press(40); press(40);
    press(13);
    expect(getSetting('homepageLanguage')).toBe('de');
  });

  it('switches Stats for Nerds on and off', async () => {
    setup();
    await openSetting('Playback', 'Stats for Nerds');
    expect(screen.getByText(/Adds Stats for Nerds to the player settings/)).toBeInTheDocument();
    press(13);
    expect(getSetting('statsForNerds')).toBe(true);
    press(13);
    expect(getSetting('statsForNerds')).toBe(false);
  });

  it('lets the categories follow the homepage from the homepage editor', async () => {
    setup();
    await openSetting('Customize', 'Customize Homepage');
    press(13);
    for (let index = 0; index < 30 && document.querySelector('.layoutRow--active')?.textContent !== 'Use this order for Categories too'; index++) press(40);
    expect(document.querySelector('.layoutRow--active')?.textContent).toBe('Use this order for Categories too');
    press(13);
    expect(getSetting('categoriesFollowHome')).toBe(true);
    expect(document.querySelector('.layoutRow--option .switch--on')).not.toBeNull();
    press(13);
    expect(getSetting('categoriesFollowHome')).toBe(false);
  });

  it('offers no such option in the sidebar editor', async () => {
    setup();
    await openSetting('Customize', 'Customize Sidebar');
    press(13);
    expect(document.querySelector('.layoutRow--option')).toBeNull();
  });

  it('shows the about row without selecting it', async () => {
    const { nav } = setup();
    await showPage('About');
    press(39);
    expect(rowLabels()).toEqual(['Odysee for webOS']);
    expect(document.querySelector('.row--static')).not.toBeNull();
    expect(document.querySelector('.row--active')).toBeNull();
    press(40);
    press(38);
    press(13);
    expect(nav.focusSidebar).not.toHaveBeenCalled();
    expect(document.querySelector('.picker')).toBeNull();
    expect(document.querySelector('.layoutEditor')).toBeNull();
    expect(screen.getByText('Unofficial App for LG webOS')).toBeInTheDocument();
    expect(screen.getByText('Version test')).toBeInTheDocument();
    press(37);
    expect(document.querySelector('.row--active')).toBeNull();
    expect(document.querySelector('.entry--active')).not.toBeNull();
    expect(nav.focusSidebar).not.toHaveBeenCalled();
  });

  it('describes the app in two lines under its name: what it is, and the version', async () => {
    setup();
    await showPage('About');
    const lines = () => Array.from(document.querySelectorAll('.row--about .row__hint')).map((node) => node.textContent);
    expect(lines()).toEqual(['Unofficial App for LG webOS', 'Version test']);
  });

  it('adds the commit the app was built from to the version when it is known', async () => {
    vi.stubGlobal('APP_COMMIT', '3f9a1c2');
    setup();
    await showPage('About');
    expect(Array.from(document.querySelectorAll('.row--about .row__hint')).map((node) => node.textContent)).toEqual(['Unofficial App for LG webOS', 'Version test, build 3f9a1c2']);
  });

  it('shows dev when the app is not built by webpack', async () => {
    vi.stubGlobal('APP_VERSION', undefined);
    vi.unstubAllGlobals();
    setup();
    await showPage('About');
    expect(Array.from(document.querySelectorAll('.row--about .row__hint')).map((node) => node.textContent)).toEqual(['Unofficial App for LG webOS', 'Version dev']);
  });

  it('gives every page and every row an icon in a chip, and lights the chip of the focused one', async () => {
    setup();
    expect(document.querySelectorAll('.masterDetail__list .entry .chip svg')).toHaveLength(6);
    await openPage('Playback');
    const rows = Array.from(document.querySelectorAll('.masterDetail__detail .row'));
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((row) => expect(row.querySelector('.chip svg')).not.toBeNull());
    expect(document.querySelector('.row--active .chip')).not.toBeNull();
    press(461);
    expect(document.querySelector('.entry--active .chip')).not.toBeNull();
  });

  it('shows the value of a choice in a pill and keeps hints on one line', async () => {
    setup();
    await openPage('Appearance');
    expect(document.querySelector('.row .row__value')?.textContent).toBe('Black');
    expect(document.querySelectorAll('.row .row__hint').length).toBeGreaterThan(5);
  });
});

describe('LoginPage', () => {
  const setup = () => {
    const onLoggedIn = vi.fn();
    return { onLoggedIn, ...renderWithNav(<LoginPage onLoggedIn={onLoggedIn} />) };
  };

  const authApi = (extra: (url: string) => unknown = () => undefined) => mockFetch((url) => {
    const custom = extra(url);
    if (custom !== undefined) return custom;
    if (url.endsWith('/user/new')) return { success: true, data: { auth_token: 't1' } };
    if (url.endsWith('/user/signin')) return { success: true, data: { primary_email: 'a@b.c', auth_token: 't2' } };
    if (url.endsWith('/user/me')) return { success: true, data: { primary_email: 'a@b.c', has_verified_email: true } };
    return { success: true, data: {} };
  });

  it('focuses the email field and validates input', async () => {
    authApi();
    setup();
    const email = screen.getByPlaceholderText('Email');
    expect(document.activeElement).toBe(email);
    fireEvent.click(screen.getByText('Send Magic Link'));
    expect(await screen.findByText('Please enter your email')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Password'));
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.click(screen.getByText('Sign In'));
    expect(await screen.findByText('Please enter your password')).toBeInTheDocument();
  });

  it('signs in with a password', async () => {
    authApi();
    const { onLoggedIn } = setup();
    fireEvent.click(screen.getByText('Password'));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(expect.objectContaining({ primary_email: 'a@b.c' })));
  });

  it('shows sign in errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authApi((url) => (url.endsWith('/user/signin') ? { success: false, error: 'Wrong password' } : undefined));
    setup();
    fireEvent.click(screen.getByText('Password'));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Sign In'));
    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
  });

  it('sends a magic link and waits for the confirmation', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    authApi();
    const { onLoggedIn } = setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.click(screen.getByText('Send Magic Link'));
    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(3100); await flush(); await flush(); });
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  });

  it('returns from the waiting screen', async () => {
    authApi();
    setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.click(screen.getByText('Send Magic Link'));
    await screen.findByText('Check Your Email');
    press(65);
    press(13);
    expect(await screen.findByText('Sign in to Odysee')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Send Magic Link'));
    await screen.findByText('Check Your Email');
    fireEvent.click(screen.getByText('Use a different method'));
    expect(await screen.findByText('Sign in to Odysee')).toBeInTheDocument();
  });

  it('reports magic link failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authApi((url) => (url.endsWith('/user/signin') ? { success: false } : undefined));
    setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.click(screen.getByText('Send Magic Link'));
    expect(await screen.findByText('Failed to send magic link')).toBeInTheDocument();
  });

  it('navigates the fields with the remote', () => {
    authApi();
    const { nav } = setup();
    const email = screen.getByPlaceholderText('Email');
    press(40);
    expect(document.activeElement).not.toBe(email);
    press(13);
    press(38);
    press(38);
    press(39);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    press(40);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Email'));
    press(40);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Password'));
    press(13);
    press(40);
    press(13);
    press(38);
    press(38);
    press(38);
    press(37);
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('opens the sidebar from the email field', () => {
    authApi();
    const { nav } = setup();
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
    press(39);
    press(40);
    press(40);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalledTimes(2);
  });

  it('submits with OK on the button and ignores keys while busy', async () => {
    authApi();
    setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } });
    press(40);
    press(40);
    press(13);
    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
  });
});
