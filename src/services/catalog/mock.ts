// Catalog answered from the seed data in services/mock/catalog.ts.

import { ApiError } from '@/services/api/errors';
import {
  buildItems,
  categories,
  categoryFilters,
  cities,
} from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import type { CatalogService } from './types';

// Auction end times count from app launch, as in the prototype.
const items = buildItems(Date.now());

export const mockCatalogService: CatalogService = {
  getCategories: async () => {
    await mockLatency();
    return categories;
  },
  getCategoryFilters: async () => {
    await mockLatency();
    return categoryFilters;
  },
  getCities: async () => {
    await mockLatency();
    return cities;
  },
  getItems: async () => {
    await mockLatency();
    return items;
  },
  getItem: async id => {
    await mockLatency();
    const item = items.find(i => i.id === id);
    if (!item) throw new ApiError('NOT_FOUND');
    return item;
  },
  // Selling arrives in Phase 4; until then nobody has listings.
  getMyListings: async () => {
    await mockLatency();
    return [];
  },
};
