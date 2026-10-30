// What the app needs from the catalog, whoever answers (mock or API).

import type {
  Category,
  CertificateCheck,
  City,
  CategoryFilters,
  CategoryId,
  Condition,
  Item,
  Lang,
  LocalPhoto,
  ListingPage,
  ListingQuery,
  Position,
  SaleType,
} from '@/lib/types';

export type CreateListingInput = {
  category: CategoryId;
  titleAr: string;
  titleEn: string;
  priceFils: number;
  /** URLs from uploadListingPhoto, cover first (1 to 5). */
  imageUrls: string[];
  condition: Condition;
  /** At least 10 words (lib/listing). */
  description: string;
  brand?: string;
  model?: string;
  type: string;
  locationId: string;
  saleType: SaleType;
  auctionEndsAt?: number;
  incrementFils?: number;
  /** A passed checkTestCertificate result; required for tested types. */
  testCertificateId?: string;
};

/** The photo of a shop's test report and the device it should describe. */
export type CertificateCheckInput = {
  photo: LocalPhoto;
  category: CategoryId;
  type: string;
  brand: string;
  model?: string;
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
  /** Count one view of a listing (when someone opens it). */
  recordView(id: string): Promise<void>;
  /** The signed-in user's own listings (Profile → My Listings). */
  getMyListings(): Promise<Item[]>;
  /** Upload one listing photo to storage; returns its public URL. */
  uploadListingPhoto(photo: LocalPhoto): Promise<string>;
  /**
   * Upload a shop's test report; the server reads it (OCR) and checks the
   * stamp, the shop, the device and the date.
   */
  checkTestCertificate(input: CertificateCheckInput): Promise<CertificateCheck>;
  createListing(input: CreateListingInput): Promise<Item>;
  /**
   * Street and neighbourhood at a GPS position, in the app's language, for
   * the delivery address ('' when unknown). The server asks a maps service.
   */
  reverseGeocode(position: Position, lang: Lang): Promise<string>;
}
