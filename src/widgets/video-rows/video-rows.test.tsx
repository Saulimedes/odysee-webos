import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { video } from '../../../tests/helpers';
import { renderWithNav, setViewport } from '../../../tests/render';
import type { Video } from '@/entities/video';
import { VideoRows, type VideoRow } from './index';

const renders = vi.hoisted(() => ({ cards: 0 }));
vi.mock('@/shared/lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib')>();
  return { ...actual, formatRelativeTime: (...args: Parameters<typeof actual.formatRelativeTime>) => { renders.cards++; return actual.formatRelativeTime(...args); } };
});

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const videos = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => video(`${prefix}${index}`) as Video);

const rows = (): VideoRow[] => [
  { id: 'r1', title: 'First', videos: videos(30, 'a'), status: 'ready' },
  { id: 'r2', title: 'Second', videos: videos(30, 'b'), status: 'ready' },
  { id: 'r3', title: 'Third', videos: videos(30, 'c'), status: 'ready' },
];

const rendered = (action: () => void) => {
  const before = renders.cards;
  action();
  return renders.cards - before;
};

beforeEach(() => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  setViewport();
  renders.cards = 0;
});

describe('VideoRows rendering', () => {
  it('renders only the cards that change when the focus moves inside a row', () => {
    renderWithNav(<VideoRows stateKey="rr1" rows={rows()} />);
    const mounted = renders.cards;
    expect(mounted).toBeGreaterThan(20);
    expect(rendered(() => press(39))).toBeLessThanOrEqual(3);
    expect(rendered(() => press(39))).toBeLessThanOrEqual(3);
    expect(rendered(() => press(37))).toBeLessThanOrEqual(3);
  });

  it('renders only the two rows that change when the focus moves to another row', () => {
    renderWithNav(<VideoRows stateKey="rr2" rows={rows()} />);
    press(39);
    const cards = document.querySelectorAll('.card').length;
    const count = rendered(() => press(40));
    expect(count).toBeLessThanOrEqual(2 + 14);
    expect(count).toBeLessThan(cards);
  });

  it('does not render a row again when only another row has changed', () => {
    const list = rows();
    const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="rr3" rows={list} />);
    const next = [list[0], { ...list[1], videos: videos(30, 'x') }, list[2]];
    const count = rendered(() => rerenderWithNav(<VideoRows stateKey="rr3" rows={next} />));
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(14);
  });

  it('does not render any card when the rows come again as the same objects', () => {
    const list = rows();
    const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="rr4" rows={list} />);
    expect(rendered(() => rerenderWithNav(<VideoRows stateKey="rr4" rows={list.slice()} />))).toBe(0);
  });

  it('plays and focuses a card that is clicked in another row', () => {
    const { nav } = renderWithNav(<VideoRows stateKey="rr5" rows={rows()} />);
    fireEvent.click(screen.getByText('Video b2'));
    expect(nav.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), expect.any(Array));
    expect(document.querySelector('.videoRow--active .videoRow__title')?.textContent).toBe('Second');
    expect(document.querySelector('.card--active')).toHaveTextContent('Video b2');
  });

  it('ignores a click on a card whose row has gone', () => {
    const list = rows();
    const { nav, rerenderWithNav } = renderWithNav(<VideoRows stateKey="rr6" rows={list} />);
    const card = screen.getByText('Video a1');
    rerenderWithNav(<VideoRows stateKey="rr6" rows={list.slice(1)} />);
    fireEvent.click(card);
    expect(nav.play).not.toHaveBeenCalled();
  });
});

describe('VideoRows start', () => {
  const loading = () => vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
  const cardsOf = (row: number) => document.querySelectorAll('.videoRow')[row].querySelectorAll('.card').length;

  it('starts with the rows and cards that are on screen, and not with those around them', () => {
    loading();
    renderWithNav(<VideoRows stateKey="st1" rows={rows()} />);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(2);
    expect(cardsOf(0)).toBe(6);
    expect(cardsOf(1)).toBe(6);
    expect(document.querySelectorAll('.card img.thumb').length).toBe(12);
  });

  it('adds the rows and cards around the screen when the pictures on screen have loaded', () => {
    const complete = loading();
    renderWithNav(<VideoRows stateKey="st2" rows={rows()} />);
    fireEvent.load(document.querySelector('.card img') as HTMLImageElement);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(2);
    complete.mockReturnValue(true);
    fireEvent.load(document.querySelectorAll('.card img')[3]);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
    expect(cardsOf(0)).toBe(9);
  });

  it('also goes on when a picture does not load', () => {
    const complete = loading();
    renderWithNav(<VideoRows stateKey="st3" rows={rows()} />);
    complete.mockReturnValue(true);
    fireEvent.error(document.querySelector('.card img') as HTMLImageElement);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
  });

  it('gives up waiting for the pictures after a while', () => {
    vi.useFakeTimers();
    try {
      loading();
      renderWithNav(<VideoRows stateKey="st4" rows={rows()} />);
      act(() => { vi.advanceTimersByTime(2400); });
      expect(document.querySelectorAll('.videoRow')).toHaveLength(2);
      act(() => { vi.advanceTimersByTime(200); });
      expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
      expect(cardsOf(0)).toBe(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it('has nothing to wait for when no card has a picture', () => {
    loading();
    const bare = rows().map((row) => ({ ...row, videos: row.videos.map((entry) => ({ ...entry, thumb: null, channelThumb: undefined })) }));
    renderWithNav(<VideoRows stateKey="st7" rows={bare} />);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
  });

  it('adds them at the first key press, so moving never shows an empty place', () => {
    loading();
    renderWithNav(<VideoRows stateKey="st5" rows={rows()} />);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(2);
    press(39);
    expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
    expect(document.querySelector('.card--active')).toHaveTextContent('Video a1');
  });

  it('only starts waiting once there are cards', () => {
    vi.useFakeTimers();
    try {
      loading();
      const empty: VideoRow[] = [{ id: 'r1', title: 'First', videos: [], status: 'loading' }, ...rows().slice(1).map((row) => ({ ...row, videos: [], status: 'loading' as const }))];
      const { rerenderWithNav } = renderWithNav(<VideoRows stateKey="st6" rows={empty} />);
      act(() => { vi.advanceTimersByTime(5000); });
      rerenderWithNav(<VideoRows stateKey="st6" rows={rows()} />);
      expect(document.querySelectorAll('.videoRow')).toHaveLength(2);
      act(() => { vi.advanceTimersByTime(2600); });
      expect(document.querySelectorAll('.videoRow')).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
