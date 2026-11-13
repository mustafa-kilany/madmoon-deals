// Format / sort / filters / query for each listing browser, keyed by scope
// ("auctions", "search", "category:tech"), so leaving and coming back keeps
// the user's choices — as the prototype's browseStates do. Not persisted.

import { create } from 'zustand';
import { initialBrowseState } from '@/lib/browsing';
import type { BrowseState } from '@/lib/types';

type BrowseStore = {
  states: Record<string, BrowseState>;
  patch: (
    scope: string,
    auctionOnly: boolean,
    patch: Partial<BrowseState>,
  ) => void;
};

export const useBrowseStore = create<BrowseStore>()(set => ({
  states: {},
  patch: (scope, auctionOnly, patch) =>
    set(s => ({
      states: {
        ...s.states,
        [scope]: {
          ...(s.states[scope] ?? initialBrowseState(auctionOnly)),
          ...patch,
        },
      },
    })),
}));

export function useBrowseState(scope: string, auctionOnly: boolean) {
  const state = useBrowseStore(s => s.states[scope]);
  const patch = useBrowseStore(s => s.patch);
  return [
    state ?? initialBrowseState(auctionOnly),
    (p: Partial<BrowseState>) => patch(scope, auctionOnly, p),
  ] as const;
}
