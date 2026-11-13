// GET /listings query: parameters, filters, sorts and the page cursor
// (docs/API.md → Catalog; the app's reference: queryListings() in frontend/src/lib/browsing.ts).

import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/errors';
import { searchWords } from './searchText';

const DAY_MS = 86_400_000;
const CONDITIONS = [
  'new',
  'excellent',
  'good',
  'loved',
  'refurbished_like_new',
  'refurbished_excellent',
  'refurbished_good',
] as const;
const SORTS = ['recommended', 'price_asc', 'price_desc', 'ending_soon', 'most_bids', 'most_viewed'] as const;
export type Sort = (typeof SORTS)[number];

const list = z
  .string()
  .optional()
  .transform(value => (value ? value.split(',').map(v => v.trim()).filter(Boolean) : []));
const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform(value => value === 'true');
const fils = z.coerce.number().int().min(0).optional();

export const listingQuery = z
  .object({
    q: z.string().max(200).optional(),
    category: z.string().max(40).optional(),
    format: z.enum(['all', 'fixed', 'auction']).default('all'),
    refurbished: flag,
    types: list,
    brands: list,
    conditions: list.pipe(z.array(z.enum(CONDITIONS))),
    cities: list,
    minPrice: fils,
    maxPrice: fils,
    verifiedOnly: flag,
    endingSoon: flag,
    sort: z.enum(SORTS).default('recommended'),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    ids: list.pipe(z.array(z.string()).max(100)),
  })
  .refine(q => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice is above maxPrice',
    path: ['minPrice'],
  });
export type ListingQuery = z.infer<typeof listingQuery>;

type Where = Prisma.ListingWhereInput;

/** On sale now: active, and auctions only until they end. */
export const liveWhere = (now: Date): Where => ({
  status: 'active',
  OR: [{ saleType: 'fixed' }, { auctionEndsAt: { gt: now } }],
});

/** Search words and category: the "scope" that facets are counted in. */
export function scopeWhere(q: ListingQuery, now: Date): Where[] {
  return [
    liveWhere(now),
    ...(q.category ? [{ category: q.category }] : []),
    ...searchWords(q.q ?? '').map(word => ({ searchText: { contains: word } })),
  ];
}

export const formatWhere = (format: ListingQuery['format']): Where[] =>
  format === 'all' ? [] : [{ saleType: format }];

export const refurbishedWhere = (refurbished: boolean): Where[] =>
  refurbished ? [{ storeId: { not: null } }] : [];

/** The filter sheet: types, brands, conditions, areas, price, verified, ending soon. */
export function filterWhere(q: ListingQuery, now: Date): Where[] {
  return [
    ...(q.types.length ? [{ type: { in: q.types } }] : []),
    ...(q.brands.length ? [{ brand: { in: q.brands } }] : []),
    ...(q.conditions.length ? [{ condition: { in: q.conditions } }] : []),
    ...(q.cities.length ? [{ locationId: { in: q.cities } }] : []),
    ...(q.minPrice !== undefined ? [{ priceFils: { gte: q.minPrice } }] : []),
    ...(q.maxPrice !== undefined ? [{ priceFils: { lte: q.maxPrice } }] : []),
    ...(q.verifiedOnly ? [{ sellerVerified: true }] : []),
    ...(q.endingSoon
      ? [{ saleType: 'auction' as const, auctionEndsAt: { lte: new Date(now.getTime() + DAY_MS) } }]
      : []),
  ];
}

// ── Sorting and the cursor (keyset pagination) ──────────────────────────────

type Key = {
  field: 'sellerVerified' | 'createdAt' | 'id' | 'priceFils' | 'auctionEndsAt' | 'bidCount' | 'views';
  dir: 'asc' | 'desc';
  nullsLast?: boolean;
  date?: boolean;
};

/** The order of each sort; the last key (id) makes it unique, so pages never repeat or skip. */
const SORT_KEYS: Record<Sort, Key[]> = {
  // DEVELOPMENT_GUIDE §1: verified sellers first, then newest.
  recommended: [
    { field: 'sellerVerified', dir: 'desc' },
    { field: 'createdAt', dir: 'desc', date: true },
    { field: 'id', dir: 'desc' },
  ],
  price_asc: [{ field: 'priceFils', dir: 'asc' }, { field: 'id', dir: 'asc' }],
  price_desc: [{ field: 'priceFils', dir: 'desc' }, { field: 'id', dir: 'asc' }],
  ending_soon: [
    { field: 'auctionEndsAt', dir: 'asc', nullsLast: true, date: true },
    { field: 'id', dir: 'asc' },
  ],
  most_bids: [{ field: 'bidCount', dir: 'desc' }, { field: 'id', dir: 'asc' }],
  most_viewed: [{ field: 'views', dir: 'desc' }, { field: 'id', dir: 'asc' }],
};

export const orderBy = (sort: Sort): Prisma.ListingOrderByWithRelationInput[] =>
  SORT_KEYS[sort].map(key => ({
    [key.field]: key.nullsLast ? { sort: key.dir, nulls: 'last' } : key.dir,
  }));

type CursorValue = string | number | boolean | null;

export const encodeCursor = (sort: Sort, row: Record<string, unknown>) =>
  Buffer.from(
    JSON.stringify({
      s: sort,
      v: SORT_KEYS[sort].map(key => {
        const value = row[key.field];
        return value instanceof Date ? value.toISOString() : (value as CursorValue);
      }),
    }),
  ).toString('base64url');

const badCursor = () => new ApiError(422, 'VALIDATION', 'cursor: unknown or from another sort');

/** Rows after the cursor in this sort's order. */
export function afterCursor(sort: Sort, cursor: string): Where {
  let decoded: { s?: string; v?: CursorValue[] };
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw badCursor();
  }
  const keys = SORT_KEYS[sort];
  if (decoded.s !== sort || !Array.isArray(decoded.v) || decoded.v.length !== keys.length)
    throw badCursor();
  const values = decoded.v.map((value, i) => {
    if (keys[i].date && value !== null) {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) throw badCursor();
      return date;
    }
    return value;
  });

  const equals = (key: Key, value: unknown): Where =>
    ({ [key.field]: value === null ? null : { equals: value } }) as Where;
  const after = (key: Key, value: unknown): Where => {
    const nothing: Where = { id: { in: [] } };
    if (value === null) return nothing; // nothing sorts after a null (nulls last)
    if (typeof value === 'boolean') {
      // Booleans have no "less than": desc puts true first, so after true comes false.
      const next = key.dir === 'desc' ? (value ? false : undefined) : value ? undefined : true;
      return next === undefined ? nothing : ({ [key.field]: next } as Where);
    }
    const beyond = { [key.field]: { [key.dir === 'asc' ? 'gt' : 'lt']: value } } as Where;
    return key.nullsLast ? { OR: [beyond, { [key.field]: null } as Where] } : beyond;
  };
  // (k1 after v1) OR (k1 = v1 AND k2 after v2) OR …
  return {
    OR: keys.map((key, i) => ({
      AND: [...keys.slice(0, i).map((k, j) => equals(k, values[j])), after(key, values[i])],
    })),
  };
}
