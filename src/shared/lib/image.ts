import { THUMBNAIL_CARD_URL, THUMBNAIL_OPTIMIZER_URL } from '@/shared/config';

const OPTIMIZABLE = /^https:\/\/(thumbs\.odycdn\.com|thumbnails\.lbry\.com)\//;
const CAN_MOVE = /\.(webp|gif)(\?|$)/i;
const step = (width: number) => Math.ceil(width / 80) * 80;

export function thumbUrl(url: string | null | undefined, width: number) {
  if (!url) return null;
  if (!OPTIMIZABLE.test(url)) return url;
  return `${THUMBNAIL_OPTIMIZER_URL}/s:${step(width)}:0/quality:80/plain/${url}`;
}

export function stillThumbUrl(url: string | null | undefined, width: number) {
  if (!url || !OPTIMIZABLE.test(url) || !CAN_MOVE.test(url)) return null;
  const wide = step(width);
  return `${THUMBNAIL_CARD_URL}/s:${wide}:${Math.round((wide * 9) / 16)}/quality:80/plain/${url}`;
}
