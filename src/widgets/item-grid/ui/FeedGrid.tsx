import type { ReactNode } from 'react';
import type { Video } from '@/entities/video';
import { usePagedFeed, type FirstPage } from '../model/usePagedFeed';
import { VideoGrid } from './VideoGrid';

interface Props {
  feedKey: string;
  fetchPage: (page: number) => Promise<Video[]>;
  pageSize: number;
  firstPage?: FirstPage;
  title?: string;
  subtitle?: string;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: ReactNode;
  progress?: (video: Video) => number;
  onLeftEdge?: () => void;
  enabled?: boolean;
  width?: number;
  height?: number;
}

export function FeedGrid({ feedKey, fetchPage, pageSize, firstPage, ...rest }: Props) {
  const feed = usePagedFeed(feedKey, fetchPage, pageSize, firstPage);
  return (
    <VideoGrid
      {...rest}
      stateKey={feedKey}
      videos={feed.videos}
      loading={feed.loading}
      loadingMore={feed.loadingMore}
      error={feed.error}
      onLoadMore={feed.loadMore}
    />
  );
}
