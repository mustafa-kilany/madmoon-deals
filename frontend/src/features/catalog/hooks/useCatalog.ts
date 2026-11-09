// Catalog queries (TanStack Query). Listings are fetched a page at a time
// (useListings) or one by one (useItem); the catalog is never downloaded whole.
// `useCatalogMeta` bundles the small lookup tables browsing screens need.

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { emptyFilters, validPriceRange } from '@/lib/browsing';
import type { Item, ListingQuery, LocalPhoto } from '@/lib/types';
import { useUser } from '@/features/auth/sessionStore';
import { catalogService } from '@/services/catalog';
import type {
  CreateListingInput,
  ListingPatch,
} from '@/services/catalog/types';
import { queryClient, queryKeys } from '@/services/queryClient';

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories,
    queryFn: catalogService.getCategories,
  });

export const useCategoryFilters = () =>
  useQuery({
    queryKey: queryKeys.categoryFilters,
    queryFn: catalogService.getCategoryFilters,
  });

export const useCities = () =>
  useQuery({ queryKey: queryKeys.cities, queryFn: catalogService.getCities });

/** Pages of listings; call fetchNextPage() when the list nears its end. */
export function useListings(query: ListingQuery, enabled = true) {
  const result = useInfiniteQuery({
    queryKey: queryKeys.listings(query),
    queryFn: ({ pageParam }) => catalogService.searchListings(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.nextCursor,
    // Keep showing the old results while a changed filter loads.
    placeholderData: keepPreviousData,
    enabled: enabled && validPriceRange(query.filters),
  });
  const first = result.data?.pages[0];
  return {
    ...result,
    items: result.data?.pages.flatMap(p => p.items) ?? [],
    total: first?.total ?? 0,
    counts: first?.counts,
    refurbishedCounts: first?.refurbishedCounts,
    facets: first?.facets,
  };
}

/** Cheapest first, so the first page's first item is the "from" price. */
const REFURBISHED_QUERY: ListingQuery = {
  refurbished: true,
  format: 'all',
  sort: 'price_asc',
  filters: emptyFilters(),
};

/**
 * The Certified Refurbished store at a glance (Home banner, store intro), from
 * one small request: how many listings, the lowest price, the brands and the
 * longest warranty.
 */
export function useRefurbishedSummary() {
  const { items, total, facets } = useListings(REFURBISHED_QUERY);
  return {
    total,
    fromFils: items[0]?.priceFils,
    brands: [
      ...new Set(
        Object.values(facets?.byCategory ?? {}).flatMap(c => c.brands),
      ),
    ],
    maxWarrantyMonths: facets?.maxWarrantyMonths ?? 0,
  };
}

/** Just the number of matches (Filters sheet's "Show N results"). */
export function useListingTotal(query: ListingQuery) {
  const { data } = useQuery({
    queryKey: [...queryKeys.listings(query), 'total'],
    queryFn: () => catalogService.searchListings(query),
    select: page => page.total,
    placeholderData: keepPreviousData,
    enabled: validPriceRange(query.filters),
  });
  return validPriceRange(query.filters) ? data : 0;
}

/** `pollMs`: keep refreshing while open, this often. */
export const useItem = (
  id: string | undefined,
  { pollMs }: { pollMs?: (item: Item | undefined) => number | false } = {},
) =>
  useQuery({
    queryKey: queryKeys.item(id ?? ''),
    queryFn: () => catalogService.getItem(id!),
    enabled: !!id,
    refetchInterval: pollMs ? query => pollMs(query.state.data) : false,
  });

/** Specific listings in the given order (Saved, recently viewed). */
export function useItemsByIds(ids: string[]) {
  const result = useQuery({
    queryKey: [...queryKeys.items, 'ids', ids],
    queryFn: async () =>
      ids.length
        ? (
            await catalogService.searchListings({
              ids,
              format: 'all',
              sort: 'recommended',
              filters: emptyFilters(),
            })
          ).items
        : ([] as Item[]),
  });
  return { ...result, items: result.data ?? [] };
}

export const useAuctionsWon = () =>
  useQuery({
    queryKey: ['auctions-won'],
    queryFn: catalogService.getAuctionsWon,
    enabled: !!useUser(),
  });

export const useMyListings = () =>
  useQuery({
    queryKey: queryKeys.myListings,
    queryFn: catalogService.getMyListings,
    enabled: !!useUser(),
  });

export type NewListing = Omit<CreateListingInput, 'imageUrls'> & {
  photos: LocalPhoto[];
};

/** Upload the photos (in parallel), then create the listing with their URLs. */
export const useCreateListing = () =>
  useMutation({
    mutationFn: async ({ photos, ...input }: NewListing) => {
      const imageUrls = await Promise.all(
        photos.map(catalogService.uploadListingPhoto),
      );
      return catalogService.createListing({ ...input, imageUrls });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings });
    },
  });

/**
 * B15.2: edit a listing. Photos are the new list: URLs already on the listing,
 * and new photos from the phone (uploaded first, in parallel).
 */
export const useUpdateListing = () =>
  useMutation({
    mutationFn: async ({
      id,
      photos,
      ...patch
    }: Omit<ListingPatch, 'imageUrls'> & {
      id: string;
      photos?: (string | LocalPhoto)[];
    }) => {
      const imageUrls = photos
        ? await Promise.all(
            photos.map(p =>
              typeof p === 'string' ? p : catalogService.uploadListingPhoto(p),
            ),
          )
        : undefined;
      return catalogService.updateListing(id, { ...patch, imageUrls });
    },
    onSuccess: item => {
      queryClient.setQueryData(queryKeys.item(item.id), item);
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings });
    },
  });

export const useWithdrawListing = () =>
  useMutation({
    mutationFn: catalogService.withdrawListing,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.item(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings });
    },
  });

/** Upload a shop's test report for the server's check (Sell form). */
export const useCheckTestCertificate = () =>
  useMutation({ mutationFn: catalogService.checkTestCertificate });

/** Categories and their filter options: small tables every browser needs. */
export function useCatalogMeta() {
  const categories = useCategories();
  const categoryFilters = useCategoryFilters();
  const queries = [categories, categoryFilters];
  return {
    categories: categories.data ?? [],
    categoryFilters: categoryFilters.data,
    isLoading: queries.some(q => q.isPending),
    isError: queries.some(q => q.isError),
    refetch: () => queries.forEach(q => q.refetch()),
  };
}
