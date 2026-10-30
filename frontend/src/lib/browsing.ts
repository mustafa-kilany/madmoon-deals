// Filtering, sorting, search and countdown logic for listing browsers, ported
// from the prototype's lib/browsing.ts. Pure functions: screens pass in the
// items and the current time.

import { jod } from './money';
import { foldText } from './text';
import type {
  ActiveFilters,
  BrowseSort,
  BrowseState,
  CategoryFilters,
  CategoryId,
  Item,
  ListingFacets,
  ListingFormat,
  ListingPage,
  ListingQuery,
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
  refurbished: false,
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

/**
 * Ended auctions never show up in browsing. `refurbished`: brand-certified
 * listings only (Item.refurbished).
 */
export function filterItems(
  items: Item[],
  filters: ActiveFilters,
  format: ListingFormat,
  now: number,
  refurbished = false,
): Item[] {
  if (!validPriceRange(filters)) return [];
  const min = filters.min ? jod(Number(filters.min)) : undefined;
  const max = filters.max ? jod(Number(filters.max)) : undefined;
  return items.filter(item => {
    const auction = item.saleType === 'auction';
    if (auction && !isLiveAuction(item, now)) return false;
    if (format !== 'all' && item.saleType !== format) return false;
    if (refurbished && !item.refurbished) return false;
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
      case 'most_viewed':
        return (b.views ?? 0) - (a.views ?? 0);
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
 * model or type name (either language), so an Arabic query finds English
 * titles too.
 */
export function searchItems(
  items: Item[],
  query: string,
  categoryFilters: Record<CategoryId, CategoryFilters>,
): Item[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter(item => {
    const type = categoryFilters[item.category]?.types.find(
      t => t.id === item.type,
    );
    const text = foldText(
      [
        item.title.en,
        item.title.ar,
        item.brand,
        item.model,
        type?.name.en,
        type?.name.ar,
      ]
        .filter(Boolean)
        .join(' '),
    );
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

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Answers a ListingQuery the way the server does (GET /listings): search,
 * filter, sort, then one page. The mock backend runs this; the real backend
 * implements the same rules (docs/API.md → Catalog).
 */
export function queryListings(
  pool: Item[],
  query: ListingQuery,
  categoryFilters: Record<CategoryId, CategoryFilters>,
  now: number,
  cursor: string | null = null,
  limit = DEFAULT_PAGE_SIZE,
): ListingPage {
  if (query.ids) {
    const items = query.ids
      .map(id => pool.find(i => i.id === id))
      .filter((i): i is Item => !!i);
    return {
      items,
      nextCursor: null,
      total: items.length,
      counts: { all: items.length, fixed: 0, auction: 0 },
      refurbishedCounts: { all: items.length, refurbished: 0 },
      facets: { categories: [], conditions: [], cities: [], byCategory: {} },
    };
  }

  const refurbished = !!query.refurbished;
  const scoped = searchItems(
    query.category ? pool.filter(i => i.category === query.category) : pool,
    query.q ?? '',
    categoryFilters,
  );
  const inFormat = filterItems(
    scoped,
    emptyFilters(),
    query.format,
    now,
    refurbished,
  );
  const matches = (format: ListingFormat, onlyRefurbished = refurbished) =>
    filterItems(scoped, query.filters, format, now, onlyRefurbished);
  const sorted = sortItems(matches(query.format), query.sort);
  const warranties = inFormat
    .map(i => i.refurbished?.warrantyMonths)
    .filter((m): m is number => m !== undefined);

  const start = cursor ? Number(cursor) : 0;
  const end = start + limit;
  const unique = <T>(values: (T | undefined)[]) =>
    [...new Set(values)].filter((v): v is T => v !== undefined);
  const byCategory: ListingFacets['byCategory'] = {};
  for (const item of inFormat) {
    const entry = (byCategory[item.category] ??= { types: [], brands: [] });
    if (!entry.types.includes(item.type)) entry.types.push(item.type);
    if (item.brand && !entry.brands.includes(item.brand))
      entry.brands.push(item.brand);
  }

  return {
    items: sorted.slice(start, end),
    nextCursor: end < sorted.length ? String(end) : null,
    total: sorted.length,
    counts: {
      all: matches('all').length,
      fixed: matches('fixed').length,
      auction: matches('auction').length,
    },
    refurbishedCounts: {
      all: matches(query.format, false).length,
      refurbished: matches(query.format, true).length,
    },
    facets: {
      categories: unique(inFormat.map(i => i.category)),
      conditions: unique(inFormat.map(i => i.condition)),
      cities: inFormat
        .map(i => i.location)
        .filter((p, i, all) => all.findIndex(x => x.id === p.id) === i),
      byCategory,
      ...(warranties.length > 0 && {
        maxWarrantyMonths: Math.max(...warranties),
      }),
    },
  };
}
