import { useEffect } from 'react';
import { isLoggedIn } from '@/entities/session';
import { syncCollections } from '@/features/collections';
import { VideoGrid } from '@/widgets/item-grid';
import { SECTIONS, type SectionId } from './sections';
import { useSectionVideos } from './useSectionVideos';

export function ListPage({ section }: { section: SectionId }) {
  const { videos, progress } = useSectionVideos();
  const config = SECTIONS.find((candidate) => candidate.id === section) ?? SECTIONS[0];

  useEffect(() => {
    if (!isLoggedIn()) return;
    if (section === 'watch-later') void syncCollections(['watchLater']);
    if (section === 'favorites') void syncCollections(['favorites']);
  }, [section]);

  return (
    <VideoGrid
      stateKey={`list:${section}`}
      title={config.title}
      videos={videos[section] ?? []}
      emptyTitle={config.emptyTitle}
      emptyHint={config.emptyHint}
      emptyIcon={config.icon}
      progress={progress}
    />
  );
}
