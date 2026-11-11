import { memo } from 'react';
import { Avatar, Thumb } from '@/shared/ui';
import { formatDuration, formatRelativeTime, pointerMoved } from '@/shared/lib';
import type { Video } from '../model/types';

interface Props {
  video: Video;
  index: number;
  active: boolean;
  thumbWidth: number;
  progress?: number;
  onSelect: (index: number) => void;
  onHover?: (index: number) => void;
  onMenu?: (index: number) => void;
}

export const VideoCard = memo(function VideoCard({ video, index, active, thumbWidth, progress = 0, onSelect, onHover, onMenu }: Props) {
  return (
    <div
      className={`card${active ? ' card--active' : ''}`}
      onClick={() => onSelect(index)}
      onContextMenu={onMenu ? (event) => { event.preventDefault(); onMenu(index); } : undefined}
      onMouseMove={onHover ? (event) => { if (pointerMoved(event)) onHover(index); } : undefined}
    >
      <div className="card__thumb">
        <Thumb src={video.thumb} width={thumbWidth} focused={active} />
        {video.duration > 0 && <span className="card__duration">{formatDuration(video.duration)}</span>}
        {progress > 0 && <div className="card__progress"><i style={{ width: `${Math.min(100, progress)}%` }} /></div>}
      </div>
      <div className="card__info">
        <Avatar src={video.channelThumb} name={video.channelTitle} size={44} />
        <div className="card__text">
          <div className="card__title">{video.title}</div>
          <div className="card__channel">{video.channelTitle}</div>
          <div className="card__meta">{formatRelativeTime(video.releaseTime)}</div>
        </div>
      </div>
    </div>
  );
});
