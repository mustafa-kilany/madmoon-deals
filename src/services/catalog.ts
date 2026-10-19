// Catalog data access. Screens use the hooks in features/catalog/hooks, which
// call this service; today it's backed by the mock seed data, and Phase 7 swaps
// in the real API behind the same interface.

import type { Category, CategoryFilters, CategoryId, Item } from '@/lib/types';
import { buildItems, categories, categoryFilters } from './mock/catalog';

export interface CatalogService {
  getCategories(): Promise<Category[]>;
  getCategoryFilters(): Promise<Record<CategoryId, CategoryFilters>>;
  getItems(): Promise<Item[]>;
  getItem(id: string): Promise<Item | undefined>;
}

const mockItems = buildItems(Date.now());

export const mockCatalogService: CatalogService = {
  getCategories: async () => categories,
  getCategoryFilters: async () => categoryFilters,
  getItems: async () => mockItems,
  getItem: async id => mockItems.find(item => item.id === id),
};

export const catalogService: CatalogService = mockCatalogService;
