import { useMemo } from 'react';
import { IconCategory } from '@tabler/icons-react';
import { OdyseeIcon } from '@/shared/ui';
import { queryClaims } from '@/entities/video';
import { categoryIcon, useHomepage } from '@/entities/category';
import { categoryFeed, FEED_PAGE_SIZE } from '@/features/browse-feeds';
import { FeedGrid } from '@/widgets/item-grid';
import { MasterDetail, type MasterEntry } from '@/widgets/master-detail';

export function CategoriesPage() {
  const homepage = useHomepage();
  const categories = homepage?.categories;
  const entries = useMemo<MasterEntry[]>(() => (categories || []).map((category) => {
    const icon = categoryIcon(category);
    return { id: category.id, label: category.label, icon: icon ? <OdyseeIcon name={icon} size={40} /> : <IconCategory size={40} /> };
  }), [categories]);

  return (
    <MasterDetail
      stateKey="categories"
      title="Categories"
      entries={entries}
      loading={!homepage}
      emptyTitle="No categories available"
      emptyIcon={<IconCategory size={64} />}
      renderDetail={(entry, context) => {
        const category = categories?.find((candidate) => candidate.id === entry.id);
        if (!category) return null;
        return (
          <FeedGrid
            key={category.id}
            feedKey={`category:${category.id}`}
            fetchPage={(page) => queryClaims(categoryFeed(category, page, FEED_PAGE_SIZE))}
            pageSize={FEED_PAGE_SIZE}
            title={category.label}
            emptyTitle="No videos found"
            emptyIcon={<IconCategory size={64} />}
            enabled={context.enabled}
            onLeftEdge={context.leaveToList}
            width={context.width}
            height={context.height}
          />
        );
      }}
    />
  );
}
