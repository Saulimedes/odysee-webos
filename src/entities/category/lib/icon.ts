import { iconKey } from '@/shared/ui';

const BY_LABEL = new Map<string, string>([
  ['discover', 'MindBlown'], ['art', 'Artists'], ['spooky', 'Horror'], ['outdoor', 'Life'], ['music', 'MusicCategory'],
  ['tech', 'Speaker'], ['technology', 'Speaker'], ['finance', 'DollarSign'], ['finance 2.0', 'DollarSign'], ['news', 'Aperature'], ['news & politics', 'Aperature'],
]);

export function categoryIcon(category: { label: string; icon: string }) {
  return iconKey(category.icon) || iconKey(BY_LABEL.get(category.label.toLowerCase())) || iconKey(category.label);
}
