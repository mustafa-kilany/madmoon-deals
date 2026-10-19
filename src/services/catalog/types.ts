// What the app needs from the catalog, whoever answers (mock or API).

import type {
  Category,
  CategoryFilters,
  CategoryId,
  Item,
  Place,
} from '@/lib/types';

export interface CatalogService {
  getCategories(): Promise<Category[]>;
  /** Item types and brands per category, for filters. */
  getCategoryFilters(): Promise<Record<CategoryId, CategoryFilters>>;
  /** Cities a listing or account can be in. */
  getCities(): Promise<Place[]>;
  getItems(): Promise<Item[]>;
  getItem(id: string): Promise<Item>;
  /** The signed-in user's own listings (Profile → My Listings). */
  getMyListings(): Promise<Item[]>;
}
