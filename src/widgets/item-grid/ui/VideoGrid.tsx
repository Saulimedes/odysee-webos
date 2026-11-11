import { useMemo, type ReactNode } from 'react';
import { contentWidth, gridMetrics, useSetting } from '@/shared/config';
import { useNav } from '@/shared/lib';
import { VideoCard, type Video } from '@/entities/video';
import { ItemGrid } from './ItemGrid';

interface Props {
  stateKey: string;
  title?: string;
  subtitle?: string;
  videos: Video[];
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: ReactNode;
  progress?: (video: Video) => number;
  onLoadMore?: () => void;
  onLeftEdge?: () => void;
  onTopEdge?: () => void;
  enabled?: boolean;
  width?: number;
  height?: number;
}

export function VideoGrid({ videos, progress, width, ...rest }: Props) {
  const nav = useNav<Video>();
  const [tileScale] = useSetting('tileScale');
  const layout = useMemo(() => gridMetrics(width ?? contentWidth(), tileScale), [width, tileScale]);
  return (
    <ItemGrid
      {...rest}
      items={videos}
      layout={layout}
      getKey={(video) => video.id}
      onSelect={(video) => nav.play(video, videos)}
      onHold={(video) => nav.openMenu(video)}
      renderItem={(video, index, active, pick, hover, menu) => (
        <VideoCard video={video} index={index} active={active} thumbWidth={layout.card.width} progress={progress?.(video)} onSelect={pick} onHover={hover} onMenu={menu} />
      )}
    />
  );
}
