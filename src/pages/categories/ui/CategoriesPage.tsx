import { useEffect, useMemo } from 'react';
import { IconCategory } from '@tabler/icons-react';
import { useSetting } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { OdyseeIcon } from '@/shared/ui';
import { peekClaims, queryClaims } from '@/entities/video';
import { categoryIcon, useHomepage, type Category } from '@/entities/category';
import { categoryFeed } from '@/features/browse-feeds';
import { useLayout, visibleItems } from '@/features/customize-layout';
import { FeedGrid } from '@/widgets/item-grid';
import { MasterDetail, type DetailContext, type MasterEntry } from '@/widgets/master-detail';

function CategoryFeed({ category, neighbours, context }: { category: Category; neighbours: Category[]; context: DetailContext }) {
  const t = useTranslation();
  useEffect(() => {
    neighbours.forEach((neighbour) => {
      queryClaims(categoryFeed(neighbour, 1), { persist: true, background: true }).catch(() => {});
    });
  }, [category.id]);
  return (
    <FeedGrid
      feedKey={`category:${category.id}`}
      fetchPage={(page) => queryClaims(categoryFeed(category, page), { persist: page === 1 })}
      firstPage={() => peekClaims(categoryFeed(category, 1))}
      pageSize={category.pageSize}
      title={t(category.label)}
      emptyTitle={t('No videos found')}
      emptyIcon={<IconCategory size={64} />}
      enabled={context.enabled}
      onLeftEdge={context.leaveToList}
      width={context.width}
      height={context.height}
    />
  );
}

export function CategoriesPage() {
  const t = useTranslation();
  const homepage = useHomepage();
  const layout = useLayout('home');
  const [followHome] = useSetting('categoriesFollowHome');
  const categories = homepage?.categories;
  const open = homepage?.open;
  const shown = useMemo(
    () => (followHome ? visibleItems(categories || [], layout) : categories || []).concat(open || []),
    [categories, open, followHome, layout],
  );
  const entries = useMemo<MasterEntry[]>(() => shown.map((category) => {
    const icon = categoryIcon(category);
    return { id: category.id, label: t(category.label), icon: icon ? <OdyseeIcon name={icon} size={40} follow /> : <IconCategory size={40} /> };
  }), [shown, t]);

  return (
    <MasterDetail
      stateKey="categories"
      title={t('Categories')}
      entries={entries}
      loading={!homepage}
      emptyTitle={t('No categories available')}
      emptyIcon={<IconCategory size={64} />}
      renderDetail={(entry, context) => {
        const at = shown.findIndex((candidate) => candidate.id === entry.id);
        if (at < 0) return null;
        const neighbours = shown.slice(Math.max(0, at - 1), at).concat(shown.slice(at + 1, at + 2));
        return <CategoryFeed key={entry.id} category={shown[at]} neighbours={neighbours} context={context} />;
      }}
    />
  );
}
