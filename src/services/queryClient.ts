// The app's TanStack Query client and every query key in one place, so
// cached data can be refreshed or cleared from anywhere (e.g. on sign-out).

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

export const queryKeys = {
  categories: ['categories'],
  categoryFilters: ['categoryFilters'],
  cities: ['cities'],
  items: ['items'],
  listings: (query: object) => ['items', 'listings', query],
  item: (id: string) => ['items', id],
  me: ['me'],
  myListings: ['me', 'listings'],
  chats: ['chats'],
  orders: ['me', 'orders'],
} as const;
