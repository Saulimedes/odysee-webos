import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claim, flush, mockFetch, rpcResult, video } from '../../tests/helpers';
import { renderWithNav, setViewport } from '../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { getSetting, setSetting } from '@/shared/config/settings';
import { session } from '@/entities/session/model/store';
import { collections } from '@/features/collections/model/collections';
import { clearPlaybackHistory, savePlaybackPosition } from '@/features/playback-history';
import type { Video } from '@/entities/video';
import { LibraryPage, ListPage } from './library';
import { SearchPage } from './search';
import { SettingsPage } from './settings';
import { LoginPage } from './login';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });
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
  setSetting('quality', 'auto');
});

describe('LibraryPage', () => {
  it('shows an empty state', () => {
    renderWithNav(<LibraryPage />);
    expect(screen.getByText('Your library is empty')).toBeInTheDocument();
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
    press(13);
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
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
    press(13);
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
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
    press(13);
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
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

  it('lists the settings sections', () => {
    setup();
    ['Theme', 'Accent Color', 'Font', 'Corners', 'Text Size', 'Card Size'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('cycles choices with left and right', () => {
    setup();
    press(39);
    expect(getSetting('themeMode')).toBe('dark');
    press(39);
    press(37);
    expect(getSetting('themeMode')).toBe('dark');
    for (let index = 0; index < 10; index++) press(39);
    expect(getSetting('themeMode')).toBe('lighttinted');
    press(40);
    press(39);
    expect(getSetting('accentColor')).toBe('#FF2D55');
  });

  it('opens the sidebar from a toggle row', () => {
    const { nav } = setup();
    for (let index = 0; index < 6; index++) press(40);
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
  });

  it('toggles switches with OK', () => {
    setup();
    for (let index = 0; index < 6; index++) press(40);
    expect(screen.getByText('Autoplay next video')).toBeInTheDocument();
    press(13);
    expect(getSetting('autoplay')).toBe(false);
    press(13);
    expect(getSetting('autoplay')).toBe(true);
  });

  it('requires an account for mature content', () => {
    const { unmount } = setup();
    for (let index = 0; index < 9; index++) press(40);
    expect(screen.getByText('Sign in required')).toBeInTheDocument();
    press(13);
    expect(getSetting('nsfw')).toBe(false);
    unmount();
    forgetRemembered();
    session.set({ token: 't', user: { primary_email: 'a@b.c' } });
    setup();
    for (let index = 0; index < 10; index++) press(40);
    press(13);
    expect(getSetting('nsfw')).toBe(true);
  });

  it('previews options in the picker and confirms or cancels', () => {
    setup();
    press(40);
    press(13);
    expect(screen.getByText('Accent Color', { selector: 'h2' })).toBeInTheDocument();
    press(40);
    press(40);
    expect(getSetting('accentColor')).toBe('#FF007F');
    press(461);
    expect(getSetting('accentColor')).toBe('#DE0050');
    expect(document.querySelector('.picker')).toBeNull();
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
  });

  it('shows fonts in their own typeface', () => {
    setup();
    press(40); press(40);
    press(13);
    expect(document.querySelector('.pickerItem')).not.toBeNull();
    press(40);
    expect((document.querySelectorAll('.pickerItem')[1] as HTMLElement).style.fontFamily).toContain('Inter');
    press(27);
  });

  it('clears local data after a confirmation', () => {
    collections.set({ watchLater: [v('a')], favorites: [], history: [v('b')] });
    savePlaybackPosition(v('c'), 100, 600);
    setup();
    for (let index = 0; index < 10; index++) press(40);
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
    for (let index = 0; index < 11; index++) press(40);
    press(13);
    press(13);
    await act(async () => { await flush(); });
    expect(spy).toHaveBeenCalled();
  });

  it('shows the account and signs out', () => {
    session.set({ token: 't', user: { primary_email: 'me@example.com', channel: { id: 'c', name: 'mine', thumb: null }, profile_image: null } });
    const { onSignOut } = setup();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByText('@mine')).toBeInTheDocument();
    press(13);
    expect(onSignOut).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sign Out'));
    expect(onSignOut).toHaveBeenCalledTimes(2);
  });

  it('shows the about row without selecting it', () => {
    const { nav } = setup();
    for (let index = 0; index < 20; index++) press(40);
    expect(screen.getByText('Odysee for webOS')).toBeInTheDocument();
    press(13);
    expect(nav.focusSidebar).not.toHaveBeenCalled();
    expect(screen.getByText(/version test/)).toBeInTheDocument();
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
