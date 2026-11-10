import { IconCategory, IconHeart, IconPlayerPlay } from '@tabler/icons-react';
import { OdyseeIcon } from '@/shared/ui';
import { categoryIcon, type Category, type Homepage } from '@/entities/category';
import { HOME_ROWS, type LayoutEntry } from '@/features/customize-layout';
import { SIDEBAR_ITEMS } from '@/widgets/sidebar';

const ICON_SIZE = 40;

type Translate = (text: string) => string;

export function sidebarEntries(t: Translate): LayoutEntry[] {
  return SIDEBAR_ITEMS.map((item) => ({
    id: item.id,
    label: t(item.label),
    icon: <item.Icon size={ICON_SIZE} />,
    note: item.account ? t('Signed in only') : undefined,
    locked: item.locked,
  }));
}

function categoryEntry(category: Category, t: Translate): LayoutEntry {
  const icon = categoryIcon({ label: category.label, icon: category.icon });
  return { id: category.id, label: t(category.label), icon: icon ? <OdyseeIcon name={icon} size={ICON_SIZE} follow /> : <IconCategory size={ICON_SIZE} /> };
}

export function homeEntries(homepage: Homepage | null, t: Translate): LayoutEntry[] {
  const categories = [homepage?.featured, ...(homepage?.categories ?? [])].filter((category): category is Category => Boolean(category));
  return [
    { id: HOME_ROWS.following, label: t('Following'), icon: <IconHeart size={ICON_SIZE} />, note: t('Signed in only') },
    { id: HOME_ROWS.continue, label: t('Continue Watching'), icon: <IconPlayerPlay size={ICON_SIZE} />, note: t('Shows once you have watched something') },
    ...categories.map((category) => categoryEntry(category, t)),
  ];
}
