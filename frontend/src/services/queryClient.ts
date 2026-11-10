// The app's TanStack Query client and every query key in one place, so
// cached data can be refreshed or cleared from anywhere (e.g. on sign-out).

import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

// React Native has no window focus: tell Query when the app is in front, so
// live polling (auction, chats 5 s, orders 15 s) stops in the background
// and stale screens refresh as soon as the app comes back.
focusManager.setEventListener(onFocus => {
  const sub = AppState.addEventListener('change', state =>
    onFocus(state === 'active'),
  );
  return () => sub.remove();
});

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
  chatMessages: (chatId: string) => ['chats', chatId, 'messages'],
  offer: (offerId: string) => ['offers', offerId],
  blocked: ['me', 'blocked'],
  orders: ['me', 'orders'],
  deliveries: ['courier', 'deliveries'],
  support: ['support'],
  notifications: (lang: string) => ['notifications', lang],
} as const;
