export function formatDuration(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

const UNITS: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'min']];

export function formatRelativeTime(timestamp?: number, now = Date.now() / 1000) {
  if (!timestamp) return '';
  const diff = now - timestamp;
  for (const [size, name] of UNITS) {
    if (diff >= size) {
      const count = Math.floor(diff / size);
      return name === 'min' ? `${count} min ago` : `${count} ${name}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'Just now';
}
