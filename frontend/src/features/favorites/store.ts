// Saved (favourited) listing ids, kept on the device. Only signed-in users can
// save; the list is cleared on sign out.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

type FavoritesState = {
  /** Most recently saved first. */
  ids: string[];
  /** Returns true if the item is now saved. */
  toggle: (id: string) => boolean;
  clear: () => void;
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
      clear: () => set({ ids: [] }),
    }),
    { name: 'favorites', storage: zustandStorage },
  ),
);
