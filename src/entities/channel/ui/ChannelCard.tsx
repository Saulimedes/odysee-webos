import { memo } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { useTranslation } from '@/shared/i18n';
import { pointerMoved } from '@/shared/lib';
import { Avatar } from '@/shared/ui';
import type { Channel } from '../model/types';

interface Props {
  channel: Channel;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
  onHover?: (index: number) => void;
}

export const ChannelCard = memo(function ChannelCard({ channel, index, active, onSelect, onHover }: Props) {
  const t = useTranslation();
  return (
    <div
      className={`card card--channel${active ? ' card--active' : ''}`}
      onClick={() => onSelect(index)}
      onMouseMove={onHover ? (event) => { if (pointerMoved(event)) onHover(index); } : undefined}
    >
      <Avatar src={channel.thumb} name={channel.title} size={110} />
      <div className="card__text">
        <div className="card__title card__title--single">{channel.title}</div>
        <div className="card__channel">@{channel.name}</div>
        <div className="card__description">{channel.description}</div>
        <div className="card__meta"><IconUsers size={22} /> {t('Channel')}</div>
      </div>
    </div>
  );
});
