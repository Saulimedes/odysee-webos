import { getSetting } from './settings';

export const SIDEBAR_WIDTH = 96;
export const PAGE_PADDING = 48;
export const CARD_GAP = 24;
const CARD_BASE_WIDTH = 400;

export interface CardMetrics { width: number; thumbHeight: number; infoHeight: number; height: number }

export function infoHeight() {
  return Math.ceil(28 + 124.8 * getSetting('textScale'));
}

export function cardMetrics(width: number): CardMetrics {
  const thumbHeight = Math.round((width * 9) / 16);
  const info = infoHeight();
  return { width, thumbHeight, infoHeight: info, height: thumbHeight + info };
}

export const rowCardMetrics = () => cardMetrics(Math.round(CARD_BASE_WIDTH * getSetting('tileScale')));

export const rowTitleHeight = () => Math.round(56 * getSetting('textScale'));

export const rowHeight = () => rowTitleHeight() + rowCardMetrics().height + 44;

export function gridMetrics(containerWidth: number, tileScale = getSetting('tileScale')) {
  const target = Math.round(CARD_BASE_WIDTH * tileScale);
  const columns = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (target * 0.9 + CARD_GAP)));
  const width = Math.floor((containerWidth - (columns - 1) * CARD_GAP) / columns);
  const card = cardMetrics(width);
  return { columns, card, rowHeight: card.height + CARD_GAP };
}

export function contentWidth() {
  return Math.max(320, window.innerWidth - SIDEBAR_WIDTH - PAGE_PADDING * 2);
}

export const TITLE_HEIGHT = 120;
export const CHANNEL_CARD_WIDTH = 560;
export const CHANNEL_CARD_HEIGHT = 240;

export function channelGridMetrics(containerWidth: number) {
  const columns = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CHANNEL_CARD_WIDTH + CARD_GAP)));
  const width = Math.floor((containerWidth - (columns - 1) * CARD_GAP) / columns);
  return { columns, card: { width, height: CHANNEL_CARD_HEIGHT }, rowHeight: CHANNEL_CARD_HEIGHT + CARD_GAP };
}

export const gridHeight = () => window.innerHeight - TITLE_HEIGHT;

export const CHANNEL_HEADER_HEIGHT = 168;
export const channelGridHeight = () => window.innerHeight - CHANNEL_HEADER_HEIGHT;
