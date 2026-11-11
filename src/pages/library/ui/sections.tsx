import type { ReactElement } from 'react';
import { IconClock, IconHistory, IconPlayerPlay, IconStar } from '@tabler/icons-react';

export type SectionId = 'continue' | 'history' | 'watch-later' | 'favorites';

export const SECTIONS: { id: SectionId; title: string; icon: ReactElement; emptyTitle: string; emptyHint: string }[] = [
  { id: 'continue', title: 'Continue Watching', icon: <IconPlayerPlay size={64} />, emptyTitle: 'Nothing to continue', emptyHint: 'Videos you start watching will appear here' },
  { id: 'watch-later', title: 'Watch Later', icon: <IconClock size={64} />, emptyTitle: 'No videos in Watch Later', emptyHint: 'Hold OK on a video, or use the player, to save it for later' },
  { id: 'favorites', title: 'Favorites', icon: <IconStar size={64} />, emptyTitle: 'No favorite videos', emptyHint: 'Hold OK on a video, or use the player, to add it to your favorites' },
  { id: 'history', title: 'Watch History', icon: <IconHistory size={64} />, emptyTitle: 'No watch history', emptyHint: 'Videos you watch will appear here' },
];
