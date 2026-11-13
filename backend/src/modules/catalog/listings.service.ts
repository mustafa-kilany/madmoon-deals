import type { Request } from 'express';
import { prisma } from '../../db';
import { categoryFilters, categoryInfo, cities } from '../../reference';
import { optionalUserId } from '../auth/requireUser';
import { visibleListings } from '../safety/blocks';
import { itemInclude, toApiItem } from './apiItem';
import {
  afterCursor,
  encodeCursor,
  filterWhere,
  formatWhere,
  orderBy,
  refurbishedWhere,
  scopeWhere,
  type ListingQuery,
} from './listingQuery';

// GET /listings (docs/API.md → Catalog). Same rules as the app's mock,
// queryListings() in frontend/src/lib/browsing.ts; the end-to-end test compares the two.

const CONDITION_ORDER = [
  'new',
  'excellent',
  'good',
  'loved',
  'refurbished_like_new',
  'refurbished_excellent',
  'refurbished_good',
];
const CATEGORY_ORDER = categoryInfo.map(c => c.id as string);
const CITY_ORDER = cities.map(c => c.id);

/** Sorts facet values the way the reference data lists them; unknown ones last, A–Z. */
const inOrder = (values: string[], order: string[]) =>
  [...values].sort((a, b) => {
    const [x, y] = [order.indexOf(a), order.indexOf(b)];
    if (x === -1 && y === -1) return a.localeCompare(b);
    if (x === -1) return 1;
    if (y === -1) return -1;
    return x - y;
  });

export async function searchListings(q: ListingQuery, req: Request) {
  if (q.ids.length > 0) return listingsByIds(q.ids, req);

  const now = new Date();
  // Reported-off listings and blocked people's listings are out of every count too.
  const scope = [...scopeWhere(q, now), ...(await visibleListings(await optionalUserId(req)))];
  const filters = filterWhere(q, now);
  const inFormat = [...scope, ...formatWhere(q.format), ...refurbishedWhere(q.refurbished)];

  const [rows, tally, facets] = await Promise.all([
    prisma.listing.findMany({
      where: { AND: [...inFormat, ...filters, ...(q.cursor ? [afterCursor(q.sort, q.cursor)] : [])] },
      orderBy: orderBy(q.sort),
      take: q.limit + 1,
      include: itemInclude,
    }),
    // Every format and refurbished combination at once, with the filters on.
    prisma.listing.groupBy({
      by: ['saleType', 'storeId'],
      where: { AND: [...scope, ...filters] },
      _count: { _all: true },
    }),
    facetsFor(inFormat),
  ]);

  const count = (format: 'all' | 'fixed' | 'auction', refurbishedOnly: boolean) =>
    tally
      .filter(row => format === 'all' || row.saleType === format)
      .filter(row => !refurbishedOnly || row.storeId !== null)
      .reduce((sum, row) => sum + row._count._all, 0);

  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(row => toApiItem(row, req)),
    nextCursor: rows.length > q.limit && last ? encodeCursor(q.sort, last) : null,
    total: count(q.format, q.refurbished),
    counts: {
      all: count('all', q.refurbished),
      fixed: count('fixed', q.refurbished),
      auction: count('auction', q.refurbished),
    },
    refurbishedCounts: { all: count(q.format, false), refurbished: count(q.format, true) },
    facets,
  };
}

/** The options that exist in scope (search, category, format, refurbished), before filters. */
async function facetsFor(inFormat: object[]) {
  const where = { AND: inFormat };
  const [types, brands, conditions, places, warranty] = await Promise.all([
    prisma.listing.groupBy({ by: ['category', 'type'], where }),
    prisma.listing.groupBy({ by: ['category', 'brand'], where: { AND: [...inFormat, { brand: { not: null } }] } }),
    prisma.listing.groupBy({ by: ['condition'], where }),
    prisma.listing.groupBy({ by: ['locationId'], where }),
    prisma.listing.aggregate({ where: { AND: [...inFormat, { storeId: { not: null } }] }, _max: { warrantyMonths: true } }),
  ]);

  const byCategory: Record<string, { types: string[]; brands: string[] }> = {};
  for (const category of inOrder([...new Set(types.map(t => t.category))], CATEGORY_ORDER)) {
    const reference = categoryFilters[category as keyof typeof categoryFilters];
    byCategory[category] = {
      types: inOrder(
        types.filter(t => t.category === category).map(t => t.type),
        reference?.types.map(t => t.id) ?? [],
      ),
      brands: inOrder(
        brands.filter(b => b.category === category).map(b => b.brand!),
        reference?.brands ?? [],
      ),
    };
  }
  const cityById = new Map(cities.map(c => [c.id, c]));
  const maxWarranty = warranty._max.warrantyMonths;

  return {
    categories: Object.keys(byCategory),
    conditions: inOrder(conditions.map(c => c.condition), CONDITION_ORDER),
    cities: inOrder(places.map(p => p.locationId), CITY_ORDER).flatMap(id => {
      const city = cityById.get(id);
      return city ? [{ id: city.id, name: city.name, governorate: city.governorate }] : [];
    }),
    byCategory,
    ...(maxWarranty !== null && { maxWarrantyMonths: maxWarranty }),
  };
}

/** ids=: exactly these, in this order (Saved, recently viewed); reserved and sold included. */
async function listingsByIds(ids: string[], req: Request) {
  const rows = await prisma.listing.findMany({
    where: { id: { in: ids }, status: { not: 'withdrawn' } },
    include: itemInclude,
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const items = ids.flatMap(id => {
    const row = byId.get(id);
    return row ? [toApiItem(row, req)] : [];
  });
  return {
    items,
    nextCursor: null,
    total: items.length,
    counts: { all: items.length, fixed: 0, auction: 0 },
    refurbishedCounts: { all: items.length, refurbished: 0 },
    facets: { categories: [], conditions: [], cities: [], byCategory: {} },
  };
}
