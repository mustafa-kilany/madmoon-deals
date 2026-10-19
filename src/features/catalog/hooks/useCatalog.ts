// Catalog queries (TanStack Query). `useCatalog` bundles what browsing
// screens need, with one loading / error state.

import { useMutation, useQuery } from '@tanstack/react-query';
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

export const useItems = () =>
  useQuery({ queryKey: queryKeys.items, queryFn: catalogService.getItems });

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

export function useCatalog() {
  const items = useItems();
  const categories = useCategories();
  const categoryFilters = useCategoryFilters();
  const queries = [items, categories, categoryFilters];
  return {
    items: items.data ?? [],
    categories: categories.data ?? [],
    categoryFilters: categoryFilters.data,
    isLoading: queries.some(q => q.isPending),
    isError: queries.some(q => q.isError),
    refetch: () => queries.forEach(q => q.refetch()),
  };
}
