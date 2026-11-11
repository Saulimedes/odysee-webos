import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, claim, mockFetch, rpcResult } from '../../../tests/helpers';
import { hoverOver, renderWithNav, setViewport } from '../../../tests/render';
import { invalidate } from '@/shared/api';
import { forgetRemembered } from '@/shared/lib/remember';
import { session } from '@/entities/session/model/store';
import { ChannelPage } from './index';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };

function api(following: string[] = []) {
  const preferences = { following: following.map((id) => ({ uri: `lbry://@one#${id}` })) };
  const calls: string[] = [];
  const spy = mockFetch((url, init) => {
    if (url.includes('/subscription/')) { calls.push(url.split('/').pop() as string); return { success: true }; }
    const body = bodyOf(init);
    if (body.method === 'preference_get') return rpcResult({ shared: { value: preferences } });
    if (body.method === 'preference_set') {
      preferences.following = JSON.parse(body.params.value).value.following;
      return rpcResult({});
    }
    if (body.method === 'claim_search') {
      const { params } = body;
      if (params.claim_type?.[0] === 'channel') return rpcResult({ items: [{ claim_id: 'c1', name: '@one', value: { title: 'Channel One', description: 'All about one' } }] });
      return rpcResult({ items: Array.from({ length: params.page_size }, (_, index) => claim(`c1-${params.page}-${index}`, `c1 video ${params.page}-${index}`)) });
    }
    return rpcResult({});
  });
  return { spy, calls, preferences };
}

const signIn = () => session.set({ token: 'tok', user: { primary_email: 'a@b.c' } });
const follow = () => document.querySelector('.channelHeader__follow') as HTMLElement | null;

beforeEach(() => {
  setViewport();
  invalidate();
  forgetRemembered();
  localStorage.clear();
  session.set({ token: null, user: null });
});

describe('ChannelPage', () => {
  it('shows the channel, what it says about itself and its videos', async () => {
    api();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    expect(screen.getByText('My channel')).toBeInTheDocument();
    expect(await screen.findByText('Channel One')).toBeInTheDocument();
    expect(screen.getByText('@one')).toBeInTheDocument();
    expect(screen.getByText('All about one')).toBeInTheDocument();
    expect(await screen.findByText('c1 video 1-0')).toBeInTheDocument();
  });

  it('has no Follow button for guests, and Up on the first row does nothing', async () => {
    api();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await screen.findByText('c1 video 1-0');
    expect(follow()).toBeNull();
    press(38);
    expect(document.querySelector('.card--active')).not.toBeNull();
  });

  it('follows from the header: Up from the first row, OK to follow, OK again to stop, Down for the videos', async () => {
    const { calls, preferences } = api();
    signIn();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await screen.findByText('c1 video 1-0');
    expect(follow()?.textContent).toBe('Follow');
    expect(follow()?.className).not.toContain('--active');
    await screen.findByText('@one');
    press(38);
    expect(follow()?.className).toContain('--active');
    expect(document.querySelector('.card--active')).toBeNull();
    press(13);
    await waitFor(() => expect(follow()?.textContent).toBe('Following'));
    expect(calls).toEqual(['new']);
    expect(preferences.following.map((entry) => entry.uri)).toEqual(['lbry://@one#c1']);
    press(13);
    await waitFor(() => expect(follow()?.textContent).toBe('Follow'));
    expect(calls).toEqual(['new', 'delete']);
    press(40);
    expect(follow()?.className).not.toContain('--active');
    expect(document.querySelector('.card--active')).not.toBeNull();
  });

  it('reaches the Follow button with Up even when the channel has no videos to focus', async () => {
    mockFetch((_url, init) => {
      const body = bodyOf(init);
      if (body.method === 'preference_get') return rpcResult({ shared: { value: { following: [] } } });
      if (body.params.claim_type?.[0] === 'channel') return rpcResult({ items: [{ claim_id: 'c1', name: '@one', value: { title: 'Channel One' } }] });
      return rpcResult({ items: [] });
    });
    signIn();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await screen.findByText('No videos found');
    await screen.findByText('@one');
    expect(follow()?.className).not.toContain('--active');
    press(38);
    expect(follow()?.className).toContain('--active');
    press(40);
    expect(follow()?.className).not.toContain('--active');
  });

  it('starts out following a channel that the account follows', async () => {
    api(['c1']);
    signIn();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await waitFor(() => expect(follow()?.textContent).toBe('Following'));
  });

  it('leaves the header to the sidebar with Left, and keeps Up and Right on the button', async () => {
    api();
    signIn();
    const { nav } = renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await screen.findByText('c1 video 1-0');
    await screen.findByText('@one');
    press(38);
    press(38);
    press(39);
    expect(nav.focusSidebar).not.toHaveBeenCalled();
    expect(follow()?.className).toContain('--active');
    press(37);
    expect(nav.focusSidebar).toHaveBeenCalled();
  });

  it('follows with a click, and waits for the channel to be known first', async () => {
    const { calls } = api();
    signIn();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    fireEvent.click(follow() as HTMLElement);
    expect(calls).toEqual([]);
    await screen.findByText('@one');
    fireEvent.click(follow() as HTMLElement);
    await waitFor(() => expect(follow()?.textContent).toBe('Following'));
  });

  it('moves the focus with the pointer between the button and the videos', async () => {
    api();
    signIn();
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    await screen.findByText('c1 video 1-0');
    hoverOver(follow() as HTMLElement);
    expect(follow()?.className).toContain('--active');
    hoverOver(screen.getByText('c1 video 1-1').closest('.card') as Element);
    expect(follow()?.className).not.toContain('--active');
  });

  it('copes with a channel that cannot be resolved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch((_url, init) => (bodyOf(init).params.claim_type?.[0] === 'channel' ? { error: { message: 'down' } } : rpcResult({ items: [] })));
    renderWithNav(<ChannelPage id="c1" name="My channel" />);
    expect(screen.getByText('My channel')).toBeInTheDocument();
    expect(await screen.findByText('No videos found')).toBeInTheDocument();
  });
});
