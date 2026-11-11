import { useTranslation } from '@/shared/i18n';
import { OptionPicker, type PickerOption } from '@/shared/ui';
import type { Video } from '@/entities/video';
import { removeFromHistory, toggleInCollection, useCollections } from '@/features/collections';
import { removePlaybackItem, usePlaybackHistory } from '@/features/playback-history';

interface Props {
  video: Video;
  onPlay: (video: Video) => void;
  onOpenChannel: (id: string, name: string) => void;
  onClose: () => void;
}

export function VideoMenu({ video, onPlay, onOpenChannel, onClose }: Props) {
  const t = useTranslation();
  const lists = useCollections();
  const resumable = usePlaybackHistory().some((item) => item.video.id === video.id);
  const saved = (kind: 'watchLater' | 'favorites') => lists[kind].some((entry) => entry.id === video.id);
  const watched = lists.history.some((entry) => entry.id === video.id);

  const options: PickerOption[] = [
    { code: 'play', native: true, name: t('Play') },
    { code: 'watchLater', native: true, name: saved('watchLater') ? t('Remove from Watch Later') : t('Add to Watch Later') },
    { code: 'favorites', native: true, name: saved('favorites') ? t('Remove from Favorites') : t('Add to Favorites') },
    ...(resumable ? [{ code: 'continue', native: true, name: t('Remove from Continue Watching') }] : []),
    ...(watched ? [{ code: 'history', native: true, name: t('Remove from Watch History') }] : []),
    ...(video.channelId ? [{ code: 'channel', native: true, name: t('Go to channel') }] : []),
  ];

  const choose = (code: string | number) => {
    onClose();
    if (code === 'play') onPlay(video);
    else if (code === 'watchLater' || code === 'favorites') toggleInCollection(code, video);
    else if (code === 'continue') removePlaybackItem(video.id);
    else if (code === 'history') removeFromHistory(video.id);
    else if (code === 'channel' && video.channelId) onOpenChannel(video.channelId, video.channelTitle);
  };

  return <OptionPicker title={video.title} options={options} value="" onClose={(confirmed, code) => (confirmed ? choose(code) : onClose())} />;
}
