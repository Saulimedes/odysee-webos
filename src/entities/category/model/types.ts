export type CategoryOrder = 'trending' | 'new' | 'top';

export interface Category {
  id: string;
  label: string;
  icon: string;
  channelIds: string[];
  pageSize: number;
  days: number;
  sortOrder: number;
  order?: CategoryOrder;
  limitPerChannel?: number;
  excludeShorts?: boolean;
  languages?: string[];
  excludedChannelIds?: string[];
}

export interface Homepage {
  featured: Category | null;
  categories: Category[];
  open?: Category[];
}

export interface RawCategory {
  label?: string;
  name?: string;
  icon?: string;
  channelIds?: string[];
  pageSize?: number;
  daysOfContent?: number;
  sortOrder?: number;
  order?: string;
  channelLimit?: string | number;
  exclude_shorts?: boolean;
  searchLanguages?: string[];
  claimType?: string[];
  excludedChannelIds?: string[];
}

export interface ContentResponse {
  status: string;
  data?: Record<string, { categories?: Record<string, RawCategory> } | undefined>;
}
