// Catalog from the Sahla API (docs/API.md → Catalog). Responses are mapped
// to app types here, so screens never see the wire format.

import type { IconName } from '@/components/icons';
import type {
  Auction,
  Category,
  CategoryFilters,
  CategoryId,
  Item,
  Place,
} from '@/lib/types';
import { api } from '../api/client';
import type { CatalogService } from './types';

type CategoryDto = Omit<Category, 'image' | 'icon'> & {
  imageUrl: string;
  icon: string;
};
/** Auction end time is an ISO-8601 string on the wire. */
type ItemDto = Omit<Item, 'auction'> & {
  auction?: Omit<Auction, 'endsAt'> & { endsAt: string };
};

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
  getCities: () => api.get<Place[]>('/cities'),
  getItems: async () => (await api.get<ItemDto[]>('/listings')).map(toItem),
  getItem: async id =>
    toItem(await api.get<ItemDto>(`/listings/${encodeURIComponent(id)}`)),
  getMyListings: async () =>
    (await api.get<ItemDto[]>('/me/listings')).map(toItem),
};
