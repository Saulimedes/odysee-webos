import { useCallback } from 'react';
import { IconBulb, IconStar } from '@tabler/icons-react';
import { useTranslation } from '@/shared/i18n';
import { EmptyState, Spinner } from '@/shared/ui';
import { peekClaims, queryClaims, type FeedQuery } from '@/entities/video';
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
    return category ? categoryFeed(category, page) : null;
  }, [source, category]);
  return { build, category, homepage };
}

export function FeedPage({ source }: { source: Source }) {
  const t = useTranslation();
  const { build, category, homepage } = useFeed(source);
  const needsCategory = source.kind === 'featured' || source.kind === 'category';
  const fetchPage = useCallback(async (page: number) => {
    const feed = build(page);
    return feed ? queryClaims(feed, { persist: Boolean(category) && page === 1 }) : [];
  }, [build, category]);

  if (needsCategory && !category) {
    return homepage ? <EmptyState icon={<IconStar size={64} />} title={t('Content not available')} /> : <div className="center"><Spinner /></div>;
  }

  const copy = {
    discover: { title: t('Discover'), subtitle: t('Trending videos on Odysee'), empty: t('No discover content'), icon: <IconBulb size={64} /> },
    featured: { title: t('Featured'), subtitle: undefined, empty: t('No featured videos'), icon: <IconStar size={64} /> },
    category: { title: category ? t(category.label) : t('Category'), subtitle: undefined, empty: t('No videos found in this category'), icon: <IconStar size={64} /> },
    channel: { title: source.kind === 'channel' ? source.name : t('Channel'), subtitle: undefined, empty: t('No videos found'), icon: <IconStar size={64} /> },
  }[source.kind];

  const feedKey = source.kind === 'discover' || source.kind === 'featured' ? source.kind : `${source.kind}:${source.id}`;
  return (
    <FeedGrid
      feedKey={feedKey}
      fetchPage={fetchPage}
      pageSize={category ? category.pageSize : FEED_PAGE_SIZE}
      firstPage={category ? () => peekClaims(categoryFeed(category, 1)) : undefined}
      title={copy.title}
      subtitle={copy.subtitle}
      emptyTitle={copy.empty}
      emptyIcon={copy.icon}
    />
  );
}
