import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { video } from '../../../tests/helpers';
import type { Video } from '@/entities/video';
import { collections } from '@/features/collections/model/collections';
import { clearPlaybackHistory, getSavedPosition, savePlaybackPosition } from '@/features/playback-history';
import { VideoMenu } from './index';

const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
const sample = video('m1') as Video;
const entries = () => Array.from(document.querySelectorAll('.pickerItem')).map((item) => item.textContent);

function setup(extra: Partial<Video> = {}) {
  const handlers = { onPlay: vi.fn(), onOpenChannel: vi.fn(), onClose: vi.fn() };
  render(<VideoMenu video={{ ...sample, ...extra }} {...handlers} />);
  return handlers;
}

beforeEach(() => {
  collections.set({ watchLater: [], favorites: [], history: [] });
  clearPlaybackHistory();
  localStorage.clear();
});

describe('VideoMenu', () => {
  it('is titled with the video and offers the things that make sense for it', () => {
    setup();
    expect(screen.getByText('Video m1', { selector: 'h2' })).toBeInTheDocument();
    expect(entries()).toEqual(['Play', 'Add to Watch Later', 'Add to Favorites', 'Go to channel']);
  });

  it('offers to remove a video from the lists it is in', () => {
    collections.set({ watchLater: [sample], favorites: [sample], history: [sample] });
    savePlaybackPosition(sample, 100, 600);
    setup();
    expect(entries()).toEqual([
      'Play', 'Remove from Watch Later', 'Remove from Favorites', 'Remove from Continue Watching', 'Remove from Watch History', 'Go to channel',
    ]);
  });

  it('has no channel entry for a video without a channel', () => {
    setup({ channelId: undefined });
    expect(entries()).not.toContain('Go to channel');
  });

  it('plays the video', () => {
    const { onPlay, onClose } = setup();
    press(13);
    expect(onClose).toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('adds and removes Watch Later and Favorites', () => {
    const { onClose } = setup();
    press(40);
    press(13);
    expect(collections.get().watchLater.map((entry) => entry.id)).toEqual(['m1']);
    expect(entries()).toContain('Remove from Watch Later');
    press(40);
    press(13);
    expect(collections.get().favorites.map((entry) => entry.id)).toEqual(['m1']);
    expect(onClose).toHaveBeenCalledTimes(2);
    press(38);
    press(13);
    expect(collections.get().watchLater).toEqual([]);
  });

  it('takes a video out of Continue Watching and out of the history', () => {
    collections.set({ watchLater: [], favorites: [], history: [sample] });
    savePlaybackPosition(sample, 100, 600);
    setup();
    press(40); press(40); press(40);
    press(13);
    expect(getSavedPosition('m1')).toBe(0);
    expect(collections.get().history).toHaveLength(1);
    press(40); press(40); press(40); press(40); press(40);
    press(13);
    expect(collections.get().history).toEqual([]);
  });

  it('opens the channel', () => {
    const { onOpenChannel, onClose } = setup();
    press(38);
    press(13);
    expect(onClose).toHaveBeenCalled();
    expect(onOpenChannel).toHaveBeenCalledWith('chan', 'Channel');
  });

  it('closes with Back and changes nothing', () => {
    const { onClose, onPlay } = setup();
    press(461);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
    expect(collections.get().watchLater).toEqual([]);
  });

  it('works with a click too', () => {
    const { onPlay } = setup();
    fireEvent.click(screen.getByText('Play'));
    expect(onPlay).toHaveBeenCalled();
  });
});
