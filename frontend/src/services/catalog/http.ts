// Catalog from the Sahla API (docs/API.md → Catalog). Responses are mapped
// to app types here, so screens never see the wire format.

import type { IconName } from '@/components/icons';
import type {
  Auction,
  Category,
  CertificateCheck,
  City,
  CategoryFilters,
  CategoryId,
  Item,
  ListingPage,
  ListingQuery,
  TestCertificate,
} from '@/lib/types';
import { jod } from '@/lib/money';
import { api, photoForm } from '../api/client';
import { toIso } from '../api/wire';
import type { CatalogService } from './types';

type CategoryDto = Omit<Category, 'image' | 'icon'> & {
  imageUrl: string;
  icon: string;
};
type TestCertificateDto = Omit<TestCertificate, 'image' | 'testedAt'> & {
  imageUrl: string;
  testedAt: string;
};
/** Auction end time and test date are ISO-8601 strings on the wire. */
type ItemDto = Omit<Item, 'auction' | 'testCertificate'> & {
  auction?: Omit<Auction, 'endsAt'> & { endsAt: string };
  testCertificate?: TestCertificateDto;
};
type CertificateCheckDto = Omit<CertificateCheck, 'testedAt'> & {
  testedAt?: string;
};

type ListingPageDto = Omit<ListingPage, 'items'> & { items: ItemDto[] };

/** ListingQuery → GET /listings query string (docs/API.md). Prices go as fils. */
export function listingParams(
  { q, category, format, refurbished, filters: f, sort, ids }: ListingQuery,
  cursor?: string | null,
): string {
  const params: [string, string][] = [];
  const add = (key: string, value: string | undefined | false) => {
    if (value) params.push([key, value]);
  };
  if (ids) {
    add('ids', ids.join(','));
  } else {
    add('q', q?.trim());
    add('category', f.category || category);
    add('format', format !== 'all' && format);
    add('refurbished', refurbished && 'true');
    add('types', f.types.join(','));
    add('brands', f.brands.join(','));
    add('conditions', f.conditions.join(','));
    add('cities', f.locations.join(','));
    add('minPrice', f.min && String(jod(Number(f.min))));
    add('maxPrice', f.max && String(jod(Number(f.max))));
    add('verifiedOnly', f.verifiedOnly && 'true');
    add('endingSoon', f.endingSoon && 'true');
    add('sort', sort);
    add('cursor', cursor ?? undefined);
  }
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

const toCategory = ({ imageUrl, icon, ...rest }: CategoryDto): Category => ({
  ...rest,
  image: { uri: imageUrl },
  icon: icon as IconName,
});

const toItem = ({ auction, testCertificate, ...rest }: ItemDto): Item => ({
  ...rest,
  auction: auction && { ...auction, endsAt: Date.parse(auction.endsAt) },
  testCertificate: testCertificate && {
    image: { uri: testCertificate.imageUrl },
    shopName: testCertificate.shopName,
    testedAt: Date.parse(testCertificate.testedAt),
    specs: testCertificate.specs,
  },
});

export const httpCatalogService: CatalogService = {
  getCategories: async () =>
    (await api.get<CategoryDto[]>('/categories')).map(toCategory),
  getCategoryFilters: () =>
    api.get<Record<CategoryId, CategoryFilters>>('/categories/filters'),
  getCities: () => api.get<City[]>('/cities'),
  searchListings: async (query, cursor) => {
    const page = await api.get<ListingPageDto>(
      `/listings?${listingParams(query, cursor)}`,
    );
    return { ...page, items: page.items.map(toItem) };
  },
  getItem: async id =>
    toItem(await api.get<ItemDto>(`/listings/${encodeURIComponent(id)}`)),
  recordView: async id => {
    await api.post(`/listings/${encodeURIComponent(id)}/views`);
  },
  getMyListings: async () =>
    (await api.get<ItemDto[]>('/me/listings')).map(toItem),
  uploadListingPhoto: async photo =>
    (
      await api.post<{ url: string }>(
        '/uploads/listing-photo',
        photoForm('photo', photo),
      )
    ).url,
  checkTestCertificate: async ({ photo, ...device }) => {
    const { testedAt, ...check } = await api.post<CertificateCheckDto>(
      '/test-certificates',
      photoForm('photo', photo, device),
    );
    return {
      ...check,
      testedAt: testedAt === undefined ? undefined : Date.parse(testedAt),
    };
  },
  createListing: async ({ auctionEndsAt, ...input }) =>
    toItem(
      await api.post<ItemDto>('/listings', {
        ...input,
        auctionEndsAt:
          auctionEndsAt === undefined ? undefined : toIso(auctionEndsAt),
      }),
    ),
  updateListing: async (id, patch) =>
    toItem(
      await api.patch<ItemDto>(`/listings/${encodeURIComponent(id)}`, patch),
    ),
  withdrawListing: async id => {
    await api.delete(`/listings/${encodeURIComponent(id)}`);
  },
  // ~1 m precision is plenty for a street; the server doesn't keep it.
  reverseGeocode: async ({ lat, lng }, lang) =>
    (
      await api.get<{ address: string }>(
        `/geocode/reverse?lat=${lat.toFixed(5)}&lng=${lng.toFixed(
          5,
        )}&lang=${lang}`,
      )
    ).address,
};
