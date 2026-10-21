const BY_LABEL: Record<string, string> = {
  Featured: 'Featured', Discover: 'MindBlown', 'Pop Culture': 'PopCulture', Art: 'Artists', Artists: 'Artists',
  Education: 'Education', Lifestyle: 'Lifestyle', Spooky: 'Ghost', Horror: 'Ghost', Gaming: 'Gaming', Comedy: 'Comedy',
  Music: 'Music', Sports: 'Sports', Science: 'Science', Technology: 'Tech', Tech: 'Tech', Finance: 'Finance',
  Spirituality: 'Spirituality', News: 'News', Movies: 'Movies', Cooking: 'Chef', Food: 'Chef',
};

const BY_ICON: Record<string, string> = {
  MindBlown: 'MindBlown', Ghost: 'Ghost', Speaker: 'Tech', Tech: 'Tech', MusicCategory: 'Music', Universe: 'Universe',
  DollarSign: 'Finance', Aperature: 'News', WildWest: 'WildWest', Compass: 'Compass', Cheese: 'Cheese', Peace: 'Peace',
  PorkBun: 'PorkBun', Chef: 'Chef', Conspiracy: 'Conspiracy', RabbitHole: 'Mysteries', Mysteries: 'Mysteries',
  Anchor: 'Spirituality', Enlightenment: 'Spirituality', Holiday: 'Holiday', Life: 'Life', TV: 'PopCulture',
};

export function categoryIcon(category: { label: string; icon: string }) {
  return BY_LABEL[category.label] || BY_ICON[category.icon] || BY_LABEL[category.icon] || null;
}
