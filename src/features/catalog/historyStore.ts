// Recently viewed listings (Home rail) and recent searches (Search screen),
// kept on the device. Same limits as the prototype: 8 items, 6 searches.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

const MAX_ITEMS = 8;
const MAX_SEARCHES = 6;

type HistoryState = {
  recentItemIds: string[];
  recentSearches: string[];
  addRecentItem: (id: string) => void;
  addRecentSearch: (query: string) => void;
};

export const useHistoryStore = create<HistoryState>()(
  persist(
    set => ({
      recentItemIds: [],
      recentSearches: [],
      addRecentItem: id =>
        set(s => ({
          recentItemIds: [id, ...s.recentItemIds.filter(x => x !== id)].slice(
            0,
            MAX_ITEMS,
          ),
        })),
      addRecentSearch: query => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set(s => ({
          recentSearches: [
            trimmed,
            ...s.recentSearches.filter(
              x => x.toLocaleLowerCase() !== trimmed.toLocaleLowerCase(),
            ),
          ].slice(0, MAX_SEARCHES),
        }));
      },
    }),
    { name: 'history', storage: zustandStorage },
  ),
);
