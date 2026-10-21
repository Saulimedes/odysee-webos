import { useEffect, useMemo, useState } from 'react';
import { IconClock, IconLock, IconPlaylist, IconStar, IconWorld } from '@tabler/icons-react';
import { EmptyState } from '@/shared/ui';
import { resolveVideos } from '@/entities/video';
import { useSession } from '@/entities/session';
import { useCollections } from '@/features/collections';
import { FeedGrid, VideoGrid } from '@/widgets/item-grid';
import { MasterDetail, type MasterEntry } from '@/widgets/master-detail';
import { loadPlaylists, type Playlist } from '../api/playlists';

const BUILT_IN = [
  { id: 'watchLater', label: 'Watch Later', icon: <IconClock size={40} /> },
  { id: 'favorites', label: 'Favorites', icon: <IconStar size={40} /> },
] as const;
const REMOTE_PAGE = 1000;

export function PlaylistsPage() {
  const { user } = useSession();
  const lists = useCollections();
  const [remote, setRemote] = useState<Playlist[] | null>(null);

  useEffect(() => {
    if (user) void loadPlaylists().then(setRemote).catch(() => setRemote([]));
  }, [user]);

  const entries = useMemo<MasterEntry[]>(() => [
    ...BUILT_IN.map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon })),
    ...(remote || []).map((playlist) => ({ id: playlist.id, label: playlist.name, icon: playlist.published ? <IconWorld size={40} /> : <IconLock size={40} /> })),
  ], [remote]);

  if (!user) return <EmptyState icon={<IconPlaylist size={64} />} title="Login to see your playlists" />;

  return (
    <MasterDetail
      stateKey="playlists"
      title="Playlists"
      entries={entries}
      loading={remote === null}
      emptyTitle="No playlists yet"
      emptyIcon={<IconPlaylist size={64} />}
      renderDetail={(entry, context) => {
        const common = { title: entry.label, emptyTitle: 'This playlist is empty', emptyIcon: <IconPlaylist size={64} />, enabled: context.enabled, onLeftEdge: context.leaveToList, width: context.width, height: context.height };
        if (entry.id === 'watchLater' || entry.id === 'favorites') {
          return <VideoGrid key={entry.id} stateKey={`playlist:${entry.id}`} videos={lists[entry.id]} {...common} />;
        }
        const playlist = remote?.find((candidate) => candidate.id === entry.id);
        if (!playlist) return null;
        return (
          <FeedGrid
            key={entry.id}
            feedKey={`playlist:${entry.id}`}
            fetchPage={async (page) => (page === 1 ? resolveVideos(playlist.itemIds.slice(0, 100)) : [])}
            pageSize={REMOTE_PAGE}
            {...common}
          />
        );
      }}
    />
  );
}
