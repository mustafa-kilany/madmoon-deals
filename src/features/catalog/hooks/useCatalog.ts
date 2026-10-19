// Catalog queries (TanStack Query) used by browsing screens from Phase 2.

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

export const useItem = (id: string) =>
  useQuery({
    queryKey: ['items', id],
    queryFn: () => catalogService.getItem(id),
  });
