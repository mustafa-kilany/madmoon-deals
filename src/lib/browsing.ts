// Filtering, sorting, search and countdown logic for listing browsers, ported
// from the prototype's lib/browsing.ts. Pure functions: screens pass in the
// items and the current time.

import { jod } from './money';
import type {
  ActiveFilters,
  BrowseSort,
  BrowseState,
  CategoryFilters,
  CategoryId,
  Item,
  ListingFormat,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const emptyFilters = (): ActiveFilters => ({
  category: '',
  types: [],
  brands: [],
  conditions: [],
  locations: [],
  min: '',
  max: '',
  verifiedOnly: false,
  endingSoon: false,
});

/** Auction-only browsers (the Auctions tab) start sorted by ending soonest. */
export const initialBrowseState = (auctionOnly = false): BrowseState => ({
  format: auctionOnly ? 'auction' : 'all',
  sort: auctionOnly ? 'ending_soon' : 'recommended',
  filters: emptyFilters(),
  query: '',
});

/** Empty or a non-negative number, and min ≤ max when both are set. */
export function validPriceRange({ min, max }: ActiveFilters): boolean {
  const valid = (value: string) =>
    value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0);
  return (
    valid(min) && valid(max) && (!min || !max || Number(min) <= Number(max))
  );
}

export const isLiveAuction = (item: Item, now: number): boolean =>
  item.saleType === 'auction' && !!item.auction && item.auction.endsAt > now;

/** Ended auctions never show up in browsing. */
export function filterItems(
  items: Item[],
  filters: ActiveFilters,
  format: ListingFormat,
  now: number,
): Item[] {
  if (!validPriceRange(filters)) return [];
  const min = filters.min ? jod(Number(filters.min)) : undefined;
  const max = filters.max ? jod(Number(filters.max)) : undefined;
  return items.filter(item => {
    const auction = item.saleType === 'auction';
    if (auction && !isLiveAuction(item, now)) return false;
    if (format !== 'all' && item.saleType !== format) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.types.length && !filters.types.includes(item.type))
      return false;
    if (filters.brands.length && !filters.brands.includes(item.brand ?? ''))
      return false;
    if (
      filters.conditions.length &&
      !filters.conditions.includes(item.condition)
    )
      return false;
    if (
      filters.locations.length &&
      !filters.locations.includes(item.location.id)
    )
      return false;
    if (filters.verifiedOnly && !item.verified) return false;
    if (
      filters.endingSoon &&
      (!auction || !item.auction || item.auction.endsAt > now + DAY_MS)
    )
      return false;
    if (min !== undefined && item.priceFils < min) return false;
    if (max !== undefined && item.priceFils > max) return false;
    return true;
  });
}

/** "Recommended" puts verified sellers first (DEVELOPMENT_GUIDE §1). */
export function sortItems(items: Item[], sort: BrowseSort): Item[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return a.priceFils - b.priceFils;
      case 'price_desc':
        return b.priceFils - a.priceFils;
      case 'ending_soon':
        return (
          (a.auction?.endsAt ?? Infinity) - (b.auction?.endsAt ?? Infinity)
        );
      case 'most_bids':
        return (b.auction?.bidCount ?? 0) - (a.auction?.bidCount ?? 0);
      default:
        return Number(b.verified) - Number(a.verified);
    }
  });
}

/** Number shown on the Filters button. A price range counts once. */
export function filterCount(filters: ActiveFilters): number {
  return (
    filters.types.length +
    filters.brands.length +
    filters.conditions.length +
    filters.locations.length +
    Number(!!filters.min || !!filters.max) +
    Number(!!filters.category) +
    Number(filters.verifiedOnly) +
    Number(filters.endingSoon)
  );
}

/**
 * Every word must appear in the listing's title (either language), brand,
 * or type name (either language), so an Arabic query finds English titles too.
 */
export function searchItems(
  items: Item[],
  query: string,
  categoryFilters: Record<CategoryId, CategoryFilters>,
): Item[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter(item => {
    const type = categoryFilters[item.category]?.types.find(
      t => t.id === item.type,
    );
    const text = [
      item.title.en,
      item.title.ar,
      item.brand,
      type?.name.en,
      type?.name.ar,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

export type TimeLeft =
  | { unit: 'ended' }
  | { unit: 'days'; days: number; hours: number }
  | { unit: 'hours'; hours: number; minutes: number }
  | { unit: 'minutes'; minutes: number; seconds: number };

/** The two largest units left, like the prototype: "2d 4h", "3h 12m", "44m 54s". */
export function timeLeft(endsAt: number, now: number): TimeLeft {
  const total = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (!total) return { unit: 'ended' };
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return { unit: 'days', days, hours };
  if (hours) return { unit: 'hours', hours, minutes };
  return { unit: 'minutes', minutes, seconds: total % 60 };
}
