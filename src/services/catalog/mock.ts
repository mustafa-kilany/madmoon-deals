import { queryListings } from '@/lib/browsing';
import type { Item } from '@/lib/types';
import { ApiError } from '@/services/api/errors';
import {
  buildItems,
  categories,
  categoryFilters,
  cities,
} from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import type { CatalogService, CreateListingInput } from './types';

// Auction end times count from app launch, as in the prototype.
const items = buildItems(Date.now());
const userListings: Item[] = [];

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
  searchListings: async (query, cursor) => {
    await mockLatency();
    return queryListings(
      [...userListings, ...items],
      query,
      categoryFilters,
      Date.now(),
      cursor,
    );
  },
  getItem: async id => {
    await mockLatency();
    const item = [...userListings, ...items].find(i => i.id === id);
    if (!item) throw new ApiError('NOT_FOUND');
    return item;
  },
  getMyListings: async () => {
    await mockLatency();
    return userListings;
  },
  createListing: async (input: CreateListingInput) => {
    await mockLatency();
    const city = cities.find(c => c.id === input.locationId) ?? cities[0];
    const newItem: Item = {
      id: `item-${Date.now()}`,
      category: input.category,
      title: { ar: input.titleAr, en: input.titleEn },
      priceFils: input.priceFils,
      imageUrl: input.imageUrl,
      condition: input.condition,
      seller: { ar: 'Ahmad', en: 'Ahmad' },
      brand: input.brand,
      type: input.type,
      verified: true,
      location: city,
      saleType: input.saleType,
      auction:
        input.saleType === 'auction' && input.auctionEndsAt
          ? {
              endsAt: input.auctionEndsAt,
              bidCount: 0,
              incrementFils: input.incrementFils ?? 1000,
            }
          : undefined,
    };
    userListings.unshift(newItem);
    return newItem;
  },
};
