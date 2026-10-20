// What the app needs from the catalog, whoever answers (mock or API).

import type {
  Category,
  City,
  CategoryFilters,
  CategoryId,
  Condition,
  Item,
  ListingPage,
  ListingQuery,
  SaleType,
} from '@/lib/types';

export type CreateListingInput = {
  category: CategoryId;
  titleAr: string;
  titleEn: string;
  priceFils: number;
  imageUrl: string;
  condition: Condition;
  brand?: string;
  type: string;
  locationId: string;
  saleType: SaleType;
  auctionEndsAt?: number;
  incrementFils?: number;
};

export interface CatalogService {
  getCategories(): Promise<Category[]>;
  /** Item types and brands per category, for filters. */
  getCategoryFilters(): Promise<Record<CategoryId, CategoryFilters>>;
  /** Cities a listing or account can be in. */
  getCities(): Promise<City[]>;
  /**
   * One page of listings for a query (search, filters, sort). The server
   * does the work, so the app never downloads the whole catalog.
   */
  searchListings(
    query: ListingQuery,
    cursor?: string | null,
  ): Promise<ListingPage>;
  getItem(id: string): Promise<Item>;
  /** The signed-in user's own listings (Profile → My Listings). */
  getMyListings(): Promise<Item[]>;
  createListing(input: CreateListingInput): Promise<Item>;
}
