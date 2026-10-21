import { THUMBNAIL_OPTIMIZER_URL } from '@/shared/config';

const OPTIMIZABLE = /^https:\/\/(thumbs\.odycdn\.com|thumbnails\.lbry\.com)\//;

export function thumbUrl(url: string | null | undefined, width: number) {
  if (!url) return null;
  if (!OPTIMIZABLE.test(url)) return url;
  return `${THUMBNAIL_OPTIMIZER_URL}/s:${Math.ceil(width / 80) * 80}:0/quality:80/plain/${url}`;
}
