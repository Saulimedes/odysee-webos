import { useMemo } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { channelGridMetrics, contentWidth } from '@/shared/config';
import { ChannelCard, type Channel } from '@/entities/channel';
import { ItemGrid } from './ItemGrid';

interface Props {
  stateKey: string;
  channels: Channel[];
  loading?: boolean;
  loadingMore?: boolean;
  emptyTitle: string;
  onSelect: (channel: Channel) => void;
  onLoadMore?: () => void;
  onTopEdge?: () => void;
  enabled?: boolean;
  height?: number;
}

export function ChannelGrid({ channels, onSelect, ...rest }: Props) {
  const layout = useMemo(() => channelGridMetrics(contentWidth()), []);
  return (
    <ItemGrid
      {...rest}
      items={channels}
      layout={layout}
      emptyIcon={<IconUsers size={64} />}
      getKey={(channel) => channel.id}
      onSelect={(channel) => onSelect(channel)}
      renderItem={(channel, index, active, pick) => <ChannelCard channel={channel} index={index} active={active} onSelect={pick} />}
    />
  );
}
