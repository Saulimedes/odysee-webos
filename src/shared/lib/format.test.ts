import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelativeTime } from './format';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => expect(formatDuration(125)).toBe('2:05'));
  it('formats hours', () => expect(formatDuration(3725)).toBe('1:02:05'));
  it('returns an empty string for missing or invalid values', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
    expect(formatDuration(Infinity)).toBe('');
  });
});

describe('formatRelativeTime', () => {
  const now = 1_000_000;
  it('returns empty without a timestamp', () => expect(formatRelativeTime(undefined, now)).toBe(''));
  it('says just now under a minute', () => expect(formatRelativeTime(now - 30, now)).toBe('Just now'));
  it('uses minutes', () => expect(formatRelativeTime(now - 300, now)).toBe('5 min ago'));
  it('uses singular and plural units', () => {
    expect(formatRelativeTime(now - 3600, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 7200, now)).toBe('2 hours ago');
    expect(formatRelativeTime(now - 86400 * 3, now)).toBe('3 days ago');
    expect(formatRelativeTime(now - 604800 * 2, now)).toBe('2 weeks ago');
    expect(formatRelativeTime(now - 2592000 * 5, now)).toBe('5 months ago');
    expect(formatRelativeTime(now - 31536000 * 2, now)).toBe('2 years ago');
  });
  it('defaults to the current time', () => expect(formatRelativeTime(Date.now() / 1000 - 7200)).toBe('2 hours ago'));
});
