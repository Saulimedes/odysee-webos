export interface Category {
  id: string;
  label: string;
  icon: string;
  channelIds: string[];
  pageSize: number;
  days: number;
  sortOrder: number;
}

export interface Homepage {
  featured: Category | null;
  categories: Category[];
}

export interface RawCategory {
  label?: string;
  name?: string;
  icon?: string;
  channelIds?: string[];
  pageSize?: number;
  daysOfContent?: number;
  sortOrder?: number;
}

export interface ContentResponse {
  status: string;
  data?: { en?: { categories?: Record<string, RawCategory> } };
}
