// Catalog from the Sahla API (docs/API.md → Catalog). Responses are mapped
// to app types here, so screens never see the wire format.

import type { IconName } from '@/components/icons';
import type {
  Auction,
  Category,
  City,
  CategoryFilters,
  CategoryId,
  Item,
  ListingPage,
  ListingQuery,
} from '@/lib/types';
import { jod } from '@/lib/money';
import { api, photoForm } from '../api/client';
import { toIso } from '../api/wire';
import type { CatalogService } from './types';

type CategoryDto = Omit<Category, 'image' | 'icon'> & {
  imageUrl: string;
  icon: string;
};
/** Auction end time is an ISO-8601 string on the wire. */
type ItemDto = Omit<Item, 'auction'> & {
  auction?: Omit<Auction, 'endsAt'> & { endsAt: string };
};

type ListingPageDto = Omit<ListingPage, 'items'> & { items: ItemDto[] };

/** ListingQuery → GET /listings query string (docs/API.md). Prices go as fils. */
export function listingParams(
  { q, category, format, filters: f, sort, ids }: ListingQuery,
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

const toItem = ({ auction, ...rest }: ItemDto): Item => ({
  ...rest,
  auction: auction && { ...auction, endsAt: Date.parse(auction.endsAt) },
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
  getMyListings: async () =>
    (await api.get<ItemDto[]>('/me/listings')).map(toItem),
  uploadListingPhoto: async photo =>
    (
      await api.post<{ url: string }>(
        '/uploads/listing-photo',
        photoForm('photo', photo),
      )
    ).url,
  createListing: async ({ auctionEndsAt, ...input }) =>
    toItem(
      await api.post<ItemDto>('/listings', {
        ...input,
        auctionEndsAt:
          auctionEndsAt === undefined ? undefined : toIso(auctionEndsAt),
      }),
    ),
};
