import type { FeedQuery } from '@/entities/video';
import type { Category } from '@/entities/category';

export const FEED_PAGE_SIZE = 40;

export const discoverFeed = (page: number, pageSize = FEED_PAGE_SIZE): FeedQuery => ({ order: 'trending', days: 30, pageSize, page });

export const categoryFeed = (category: Category, page: number, pageSize = category.pageSize): FeedQuery => ({
  channelIds: category.channelIds, order: 'trending', days: category.days, pageSize, page,
});

export const channelFeed = (channelId: string, page: number, pageSize = FEED_PAGE_SIZE): FeedQuery => ({
  channelIds: [channelId], order: 'new', pageSize, page,
});
