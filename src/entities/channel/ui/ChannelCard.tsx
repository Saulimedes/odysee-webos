import { memo } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { Avatar } from '@/shared/ui';
import type { Channel } from '../model/types';

interface Props {
  channel: Channel;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
}

export const ChannelCard = memo(function ChannelCard({ channel, index, active, onSelect }: Props) {
  return (
    <div className={`card card--channel${active ? ' card--active' : ''}`} onClick={() => onSelect(index)}>
      <Avatar src={channel.thumb} name={channel.title} size={110} />
      <div className="card__text">
        <div className="card__title card__title--single">{channel.title}</div>
        <div className="card__channel">@{channel.name}</div>
        <div className="card__description">{channel.description}</div>
        <div className="card__meta"><IconUsers size={22} /> Channel</div>
      </div>
    </div>
  );
});
