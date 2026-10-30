// "Similar items" under a listing: the same kind of item (e.g. other cars),
// either at a similar price (product page) or most viewed first, any price
// (auction page). The server does the matching. When nothing else matches,
// it falls back to the same category, so the row is rarely empty.

import { emptyFilters } from '@/lib/browsing';
import { FILS_PER_JOD } from '@/lib/money';
import type { ActiveFilters, Item, ListingQuery } from '@/lib/types';
import { useListings } from './useCatalog';

/** How far "similar price" reaches either side of the item's price. */
const SIMILAR_PRICE_SPREAD = 0.3;

const MAX_SIMILAR = 6;

/** Whole-dinar price range for similar items, e.g. 10,000 → 7,000–13,000. */
export function similarPriceRange(priceFils: number) {
  const price = priceFils / FILS_PER_JOD;
  return {
    min: Math.floor(price * (1 - SIMILAR_PRICE_SPREAD)),
    max: Math.ceil(price * (1 + SIMILAR_PRICE_SPREAD)),
  };
}

export type SimilarBy = 'price' | 'views';

/** `item` may still be loading; the queries wait for it. */
export function useSimilarItems(item: Item | undefined, by: SimilarBy) {
  const range = similarPriceRange(item?.priceFils ?? 0);
  const query = (filters: ActiveFilters): ListingQuery => ({
    category: item?.category,
    format: 'all',
    sort: by === 'views' ? 'most_viewed' : 'recommended',
    filters,
  });

  const matching = useListings(
    query({
      ...emptyFilters(),
      types: item?.type ? [item.type] : [],
      ...(by === 'price' && {
        min: String(range.min),
        max: String(range.max),
      }),
    }),
    !!item,
  );
  const matchingItems = matching.items.filter(i => i.id !== item?.id);
  const fallback = !!item && !matching.isPending && !matchingItems.length;
  const sameCategory = useListings(query(emptyFilters()), fallback);

  return {
    items: (fallback
      ? sameCategory.items.filter(i => i.id !== item?.id)
      : matchingItems
    ).slice(0, MAX_SIMILAR),
    /** True when showing the same category instead of close matches. */
    fallback,
    range,
  };
}
