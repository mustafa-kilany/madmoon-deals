// Saved (favourited) listing ids, kept on the device. Guests can save too.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

type FavoritesState = {
  /** Most recently saved first. */
  ids: string[];
  /** Returns true if the item is now saved. */
  toggle: (id: string) => boolean;
};

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: id => {
        const saved = get().ids.includes(id);
        set({
          ids: saved ? get().ids.filter(x => x !== id) : [id, ...get().ids],
        });
        return !saved;
      },
    }),
    { name: 'favorites', storage: zustandStorage },
  ),
);
