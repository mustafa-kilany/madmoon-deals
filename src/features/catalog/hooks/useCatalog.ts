// Catalog queries (TanStack Query). `useCatalog` bundles what browsing
// screens need, with one loading / error state.

import { useQuery } from '@tanstack/react-query';
import { catalogService } from '@/services/catalog';

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: catalogService.getCategories });

export const useCategoryFilters = () =>
  useQuery({
    queryKey: ['categoryFilters'],
    queryFn: catalogService.getCategoryFilters,
  });

export const useItems = () =>
  useQuery({ queryKey: ['items'], queryFn: catalogService.getItems });

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
