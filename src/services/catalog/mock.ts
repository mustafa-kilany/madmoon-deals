import { queryListings } from '@/lib/browsing';
import type { Item } from '@/lib/types';
import { categories, categoryFilters, cities } from '../mock/catalog';
import { mockLatency } from '../mock/delay';
import {
  allItems,
  blocked,
  findItem,
  me,
  nextId,
  publicItem,
  userListings,
} from '../mock/marketplace';
import type { CatalogService, CreateListingInput } from './types';

/** What browsing shows: for sale, and not from someone the caller blocked. */
const browsable = (item: Item) =>
  item.status === 'active' && !blocked.has(item.sellerId);

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
    // Saved and recently viewed (ids) still show sold items, with their status.
    const pool = query.ids ? allItems() : allItems().filter(browsable);
    const page = queryListings(
      pool,
      query,
      categoryFilters,
      Date.now(),
      cursor,
    );
    return { ...page, items: page.items.map(item => publicItem(item)) };
  },
  getItem: async id => {
    await mockLatency();
    return publicItem(findItem(id));
  },
  recordView: async id => {
    await mockLatency();
    const item = findItem(id);
    item.views = (item.views ?? 0) + 1;
  },
  getMyListings: async () => {
    await mockLatency();
    // New objects each time, like a real response: Query compares by
    // reference, so returning the mutated originals never redraws the list.
    return userListings
      .filter(item => item.sellerId === me().id)
      .map(item => publicItem(item));
  },
  // The phone's own file stands in for the uploaded copy.
  uploadListingPhoto: async photo => {
    await mockLatency();
    return photo.uri;
  },
  createListing: async (input: CreateListingInput) => {
    await mockLatency();
    const city = cities.find(c => c.id === input.locationId) ?? cities[0];
    const seller = me();
    const newItem: Item = {
      id: nextId('item'),
      category: input.category,
      title: { ar: input.titleAr, en: input.titleEn },
      priceFils: input.priceFils,
      imageUrl: input.imageUrls[0],
      imageUrls: input.imageUrls,
      condition: input.condition,
      description: input.description?.trim() || undefined,
      seller: { ar: seller.name, en: seller.name },
      sellerId: seller.id,
      status: 'active',
      brand: input.brand,
      model: input.model,
      type: input.type,
      verified: true,
      location: city,
      saleType: input.saleType,
      views: 0,
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
    return publicItem(newItem);
  },
};
