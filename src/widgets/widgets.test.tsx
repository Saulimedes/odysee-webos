import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, video } from '../../tests/helpers';
import { renderWithNav, setViewport } from '../../tests/render';
import type { Video } from '@/entities/video';
import type { Channel } from '@/entities/channel';
import { session } from '@/entities/session/model/store';
import { Sidebar } from './sidebar';
import { ChannelGrid, FeedGrid, VideoGrid } from './item-grid';
import { VideoRows, type VideoRow } from './video-rows';
import { MasterDetail, type MasterEntry } from './master-detail';

const press = (keyCode: number) => fireEvent.keyDown(window, { keyCode });
const videos = (count: number, prefix = 'v') => Array.from({ length: count }, (_, index) => video(`${prefix}${index}`) as Video);

beforeEach(() => {
  setViewport();
  session.set({ token: null, user: null });
});

describe('Sidebar', () => {
  const setup = (focused: boolean) => {
    const props = { selected: 'home', focused, onSelect: vi.fn(), onLeave: vi.fn() };
    render(<Sidebar {...props} />);
    return props;
  };

  it('shows the login entry only for guests', () => {
    setup(false);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Following')).toBeNull();
    expect(screen.getByText('Odysee')).toBeInTheDocument();
  });

  it('shows account entries and the channel for signed in users', () => {
    session.set({ token: 't', user: { primary_email: 'a@b.c', profile_image: 'https://x/p.png', channel: { id: 'c', name: 'me', thumb: null } } });
    setup(false);
    expect(screen.queryByText('Login')).toBeNull();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.getByText('Playlists')).toBeInTheDocument();
    expect(screen.getByText('@me')).toBeInTheDocument();
  });

  it('falls back to the app name for users without a channel', () => {
    session.set({ token: 't', user: { primary_email: 'a@b.c' } });
    setup(false);
    expect(screen.getByText('Odysee')).toBeInTheDocument();
  });

  it('navigates with the remote while focused', () => {
    const props = setup(true);
    press(40); press(40);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('featured');
    press(38); press(38); press(38); press(38); press(38);
    press(13);
    expect(props.onSelect).toHaveBeenLastCalledWith('login');
    press(39);
    expect(props.onLeave).toHaveBeenCalled();
    expect(fireEvent.keyDown(window, { keyCode: 65 })).toBe(true);
  });

  it('ignores the remote while unfocused and supports clicks', () => {
    const props = setup(false);
    press(13);
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Settings'));
    expect(props.onSelect).toHaveBeenCalledWith('settings');
  });

  it('starts at the first item when the selected screen is not in the menu', () => {
    const props = { selected: 'channel', focused: true, onSelect: vi.fn(), onLeave: vi.fn() };
    render(<Sidebar {...props} />);
    press(13);
    expect(props.onSelect).toHaveBeenCalledWith('login');
  });
});

describe('VideoGrid', () => {
  it('renders cards, moves focus and plays the selected video', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g1" videos={videos(10)} title="Title" subtitle="Sub" emptyTitle="Empty" />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Video v0')).toBeInTheDocument();
    press(39);
    press(13);
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
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

  it('selects by click and moves with the wheel', () => {
    const { nav } = renderWithNav(<VideoGrid stateKey="g6" videos={videos(12)} emptyTitle="Empty" />);
    fireEvent.click(screen.getByText('Video v2'));
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' }));
    fireEvent.wheel(document.querySelector('.vgrid') as HTMLElement, { deltaY: 100 });
    fireEvent.wheel(document.querySelector('.vgrid') as HTMLElement, { deltaY: -100 });
    expect(document.querySelectorAll('.card').length).toBeGreaterThan(0);
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
    const fetchPage = vi.fn(async () => videos(3, 'c'));
    const first = renderWithNav(<FeedGrid feedKey="feed-2" fetchPage={fetchPage} pageSize={3} emptyTitle="Empty" />);
    await screen.findByText('Video c0');
    first.unmount();
    renderWithNav(<FeedGrid feedKey="feed-2" fetchPage={fetchPage} pageSize={3} emptyTitle="Empty" />);
    expect(screen.getByText('Video c0')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledTimes(1);
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

  it('moves across and between rows and plays the focused card', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="vr2" rows={rows()} />);
    press(39); press(39);
    press(13);
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a2' }));
    press(40);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    press(13);
    expect(nav.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b0' }));
    press(40);
    press(40);
    press(38);
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

  it('plays on click and scrolls rows with the wheel', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="vr6" rows={rows()} />);
    fireEvent.click(screen.getByText('Video a1'));
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    fireEvent.wheel(document.querySelector('.videoRows') as HTMLElement, { deltaY: 100 });
    fireEvent.wheel(document.querySelector('.videoRows') as HTMLElement, { deltaY: -100 });
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

