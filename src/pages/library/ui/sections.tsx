import type { ReactElement } from 'react';
import { IconClock, IconHistory, IconPlayerPlay, IconStar } from '@tabler/icons-react';

export type SectionId = 'continue' | 'history' | 'watch-later' | 'favorites';

export const SECTIONS: { id: SectionId; title: string; icon: ReactElement; emptyTitle: string; emptyHint: string }[] = [
  { id: 'continue', title: 'Continue Watching', icon: <IconPlayerPlay size={64} />, emptyTitle: 'Nothing to continue', emptyHint: 'Videos you start watching will appear here' },
  { id: 'watch-later', title: 'Watch Later', icon: <IconClock size={64} />, emptyTitle: 'No videos in Watch Later', emptyHint: 'Add videos to watch later from the player' },
  { id: 'favorites', title: 'Favorites', icon: <IconStar size={64} />, emptyTitle: 'No favorite videos', emptyHint: 'Add videos to favorites from the player' },
  { id: 'history', title: 'Watch History', icon: <IconHistory size={64} />, emptyTitle: 'No watch history', emptyHint: 'Videos you watch will appear here' },
];
