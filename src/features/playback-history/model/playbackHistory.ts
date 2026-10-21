import { STORAGE } from '@/shared/config';
import { createStore, readJson, writeJson } from '@/shared/lib';
import { normalizeVideo, type Video } from '@/entities/video';

export interface PlaybackItem {
  video: Video;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
}

const VERSION = 1;
const MAX_ITEMS = 20;
const MIN_POSITION_SECONDS = 10;
const COMPLETION_RATIO = 0.95;

const positive = (value: number) => Number.isFinite(value) && value > 0;

function normalizeItem(raw: Partial<PlaybackItem> | null | undefined): PlaybackItem | null {
  const video = normalizeVideo(raw?.video);
  const positionSeconds = Number(raw?.positionSeconds);
  const durationSeconds = Number(raw?.durationSeconds);
  if (!video || !positive(positionSeconds) || !positive(durationSeconds)) return null;
  if (positionSeconds / durationSeconds >= COMPLETION_RATIO) return null;
  return { video, positionSeconds, durationSeconds, updatedAt: Number(raw?.updatedAt) || 0 };
}

export function readPlaybackHistory(): PlaybackItem[] {
  const stored = readJson<{ version?: number; items?: PlaybackItem[] } | null>(STORAGE.CONTINUE_WATCHING, null);
  if (stored?.version !== VERSION || !Array.isArray(stored.items)) return [];
  return stored.items
    .map(normalizeItem)
    .filter((item): item is PlaybackItem => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITEMS);
}

const history = createStore<PlaybackItem[]>(readPlaybackHistory());

export const usePlaybackHistory = history.use;

function write(items: PlaybackItem[]) {
  const next = items.slice(0, MAX_ITEMS);
  history.set(next);
  return writeJson(STORAGE.CONTINUE_WATCHING, { version: VERSION, items: next });
}

export function removePlaybackItem(id: string) {
  const items = history.get();
  const next = items.filter((item) => item.video.id !== id);
  return next.length === items.length ? false : write(next);
}

export function savePlaybackPosition(video: Video, positionSeconds: number, durationSeconds: number) {
  if (!positive(positionSeconds) || !positive(durationSeconds)) return false;
  if (positionSeconds / durationSeconds >= COMPLETION_RATIO) return removePlaybackItem(video.id);
  const items = history.get();
  if (!items.some((item) => item.video.id === video.id) && positionSeconds < MIN_POSITION_SECONDS) return false;
  const item: PlaybackItem = { video, positionSeconds, durationSeconds, updatedAt: Date.now() };
  return write([item, ...items.filter((entry) => entry.video.id !== video.id)]);
}

export function getSavedPosition(id: string) {
  return history.get().find((item) => item.video.id === id)?.positionSeconds ?? 0;
}

export function clearPlaybackHistory() {
  write([]);
}

export const progressPercent = (item: PlaybackItem) => (item.positionSeconds / item.durationSeconds) * 100;
