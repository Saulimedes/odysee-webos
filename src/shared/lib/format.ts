import { t } from '@/shared/i18n';

export function formatDuration(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

const UNITS: [number, (count: number) => string][] = [
  [31536000, (count) => t('{count} year ago|{count} years ago', { count })],
  [2592000, (count) => t('{count} month ago|{count} months ago', { count })],
  [604800, (count) => t('{count} week ago|{count} weeks ago', { count })],
  [86400, (count) => t('{count} day ago|{count} days ago', { count })],
  [3600, (count) => t('{count} hour ago|{count} hours ago', { count })],
  [60, (count) => t('{count} min ago', { count })],
];

export function formatRelativeTime(timestamp?: number, now = Date.now() / 1000) {
  if (!timestamp) return '';
  const diff = now - timestamp;
  for (const [size, text] of UNITS) {
    if (diff >= size) return text(Math.floor(diff / size));
  }
  return t('Just now');
}
