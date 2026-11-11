export interface SearchFilters { sort: string; time: string; length: string }

export const DEFAULT_FILTERS: SearchFilters = { sort: 'relevance', time: 'any', length: 'any' };

const TIME_FILTERS: Record<string, string> = { today: 'today', week: 'thisweek', month: 'thismonth', year: 'thisyear' };
const SHORT_SECONDS = 4 * 60;
const LONG_SECONDS = 20 * 60;

export const isFiltered = (filters: SearchFilters) => filters.sort !== DEFAULT_FILTERS.sort || filters.time !== DEFAULT_FILTERS.time || filters.length !== DEFAULT_FILTERS.length;

export const filtersKey = (filters: SearchFilters) => `${filters.sort}:${filters.time}:${filters.length}`;

export function filterParams(filters: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.sort === 'newest') params.sort_by = 'release_time';
  if (TIME_FILTERS[filters.time]) params.time_filter = TIME_FILTERS[filters.time];
  if (filters.length === 'short') params.max_duration = String(SHORT_SECONDS);
  if (filters.length === 'long') params.min_duration = String(LONG_SECONDS);
  return params;
}
