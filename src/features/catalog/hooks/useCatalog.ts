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
import type { Item, ListingQuery } from '@/lib/types';
import { useUser } from '@/features/auth/sessionStore';
import { catalogService } from '@/services/catalog';
import type { CreateListingInput } from '@/services/catalog/types';
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
    facets: first?.facets,
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

export const useItem = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.item(id ?? ''),
    queryFn: () => catalogService.getItem(id!),
    enabled: !!id,
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

export const useMyListings = () =>
  useQuery({
    queryKey: queryKeys.myListings,
    queryFn: catalogService.getMyListings,
    enabled: !!useUser(),
  });

export const useCreateListing = () =>
  useMutation({
    mutationFn: (input: CreateListingInput) =>
      catalogService.createListing(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings });
    },
  });

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
