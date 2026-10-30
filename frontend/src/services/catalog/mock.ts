import { queryListings } from '@/lib/browsing';
import { descriptionValid, needsTestCertificate } from '@/lib/listing';
import { nearestCity } from '@/lib/places';
import type { CertificateCheck, Item, TestCertificate } from '@/lib/types';
import { ApiError } from '../api/errors';
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

/** Test certificates checked in this session, by id. */
const certificates = new Map<
  string,
  {
    ownerId: string;
    check: CertificateCheck;
    imageUri: string;
    /** What it was checked against; the listing must be the same device. */
    device: { type: string; brand: string; model?: string };
    /** The listing it went on (one certificate, one listing). */
    usedBy?: string;
  }
>();

/** What the mock "reads" off a report, per item type. */
const mockSpecs: Record<string, string> = {
  phones: '128GB',
  tablets: '64GB',
  smartwatches: '44mm',
  laptops: '16GB RAM',
  gaming: '825GB',
  tvs: '55"',
  cameras: '24MP',
};

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
  checkTestCertificate: async ({ photo, type, brand, model }) => {
    // Reading the photo (OCR) takes the real server a few seconds.
    await mockLatency();
    await mockLatency();
    await mockLatency();
    // The mock can't read photos: it "reads" the device the seller chose.
    const check: CertificateCheck = {
      id: nextId('cert'),
      status: 'passed',
      problems: [],
      shopName: 'Smart Fix Mobile',
      testedAt: Date.now() - 24 * 60 * 60 * 1000,
      device: [brand, model].filter(Boolean).join(' '),
      specs: [mockSpecs[type] ?? 'All tests OK'],
    };
    certificates.set(check.id, {
      ownerId: me().id,
      check,
      imageUri: photo.uri,
      device: { type, brand, model },
    });
    return check;
  },
  createListing: async (input: CreateListingInput) => {
    await mockLatency();
    // Refurbished grades belong to brand-store listings (docs/API.md).
    if (input.condition.startsWith('refurbished_'))
      throw new ApiError('VALIDATION', 'Not a seller condition', 422);
    if (!descriptionValid(input.description))
      throw new ApiError('VALIDATION', 'Description: at least 10 words', 422);
    const city = cities.find(c => c.id === input.locationId) ?? cities[0];
    const seller = me();
    const id = nextId('item');
    const type = categoryFilters[input.category]?.types.find(
      t => t.id === input.type,
    );
    let testCertificate: TestCertificate | undefined;
    if (needsTestCertificate(type)) {
      const cert = certificates.get(input.testCertificateId ?? '');
      const sameDevice =
        cert?.device.type === input.type &&
        cert.device.brand === input.brand &&
        cert.device.model === input.model;
      if (
        !cert ||
        cert.ownerId !== seller.id ||
        cert.check.status !== 'passed' ||
        cert.usedBy ||
        !sameDevice
      )
        throw new ApiError(
          'VALIDATION',
          'A passed test certificate for this device is required',
          422,
        );
      cert.usedBy = id;
      testCertificate = {
        image: { uri: cert.imageUri },
        shopName: cert.check.shopName ?? '',
        testedAt: cert.check.testedAt ?? Date.now(),
        specs: cert.check.specs,
      };
    }
    const newItem: Item = {
      id,
      category: input.category,
      title: { ar: input.titleAr, en: input.titleEn },
      priceFils: input.priceFils,
      imageUrl: input.imageUrls[0],
      imageUrls: input.imageUrls,
      condition: input.condition,
      description: input.description.trim(),
      testCertificate,
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
  reverseGeocode: async (position, lang) => {
    await mockLatency();
    // Stand-in for a maps service: the nearest area's main street.
    const area = nearestCity(cities, position);
    if (!area) return '';
    return lang === 'ar'
      ? `الشارع الرئيسي، ${area.name.ar}`
      : `Main Street, ${area.name.en}`;
  },
};
