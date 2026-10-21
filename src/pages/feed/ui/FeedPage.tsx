import { useCallback } from 'react';
import { IconBulb, IconStar } from '@tabler/icons-react';
import { EmptyState, Spinner } from '@/shared/ui';
import { queryClaims, type FeedQuery } from '@/entities/video';
import { categoryFeed, channelFeed, discoverFeed, FEED_PAGE_SIZE } from '@/features/browse-feeds';
import { useHomepage } from '@/entities/category';
import { FeedGrid } from '@/widgets/item-grid';

type Source = { kind: 'discover' } | { kind: 'featured' } | { kind: 'category'; id: string } | { kind: 'channel'; id: string; name: string };

function useFeed(source: Source) {
  const homepage = useHomepage();
  const category = source.kind === 'featured' ? homepage?.featured : source.kind === 'category' ? homepage?.categories.find((entry) => entry.id === source.id) : null;
  const build = useCallback((page: number): FeedQuery | null => {
    if (source.kind === 'discover') return discoverFeed(page);
    if (source.kind === 'channel') return channelFeed(source.id, page);
    return category ? categoryFeed(category, page, FEED_PAGE_SIZE) : null;
  }, [source, category]);
  return { build, category, homepage };
}

export function FeedPage({ source }: { source: Source }) {
  const { build, category, homepage } = useFeed(source);
  const needsCategory = source.kind === 'featured' || source.kind === 'category';
  const fetchPage = useCallback(async (page: number) => {
    const feed = build(page);
    return feed ? queryClaims(feed) : [];
  }, [build]);

  if (needsCategory && !category) {
    return homepage ? <EmptyState icon={<IconStar size={64} />} title="Content not available" /> : <div className="center"><Spinner /></div>;
  }

  const copy = {
    discover: { title: 'Discover', subtitle: 'Trending videos on Odysee', empty: 'No discover content', icon: <IconBulb size={64} /> },
    featured: { title: 'Featured', subtitle: undefined, empty: 'No featured videos', icon: <IconStar size={64} /> },
    category: { title: category?.label ?? 'Category', subtitle: undefined, empty: 'No videos found in this category', icon: <IconStar size={64} /> },
    channel: { title: source.kind === 'channel' ? source.name : 'Channel', subtitle: undefined, empty: 'No videos found', icon: <IconStar size={64} /> },
  }[source.kind];

  const feedKey = source.kind === 'discover' || source.kind === 'featured' ? source.kind : `${source.kind}:${source.id}`;
  return (
    <FeedGrid
      feedKey={feedKey}
      fetchPage={fetchPage}
      pageSize={FEED_PAGE_SIZE}
      title={copy.title}
      subtitle={copy.subtitle}
      emptyTitle={copy.empty}
      emptyIcon={copy.icon}
    />
  );
}
