// GET /listings against the app's own reference implementation: the demo
// catalog is seeded into the test database, then each query is answered by the
// server and by queryListings() (src/lib/browsing.ts), and the answers compared.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { emptyFilters, queryListings } from '@/lib/browsing';
import type { ActiveFilters, Item, ListingQuery as AppQuery } from '@/lib/types';
import { demoItems, seedListings } from '../../../scripts/seed-listings';
import { app } from '../../app';
import { prisma } from '../../db';
import { categoryFilters } from '../../reference';

const now = Date.now();
let pool: Item[] = [];
let base = '';
const server = app.listen(0);

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  await seedListings(now);
  pool = demoItems(now);
});
after(async () => {
  server.close();
  await prisma.$disconnect();
});

type Query = Partial<Omit<AppQuery, 'filters'>> & { filters?: Partial<ActiveFilters> };

/** The same query for the app (AppQuery) and as GET /listings parameters. */
function both(query: Query) {
  const filters = { ...emptyFilters(), ...query.filters };
  const appQuery: AppQuery = {
    format: 'all',
    sort: 'recommended',
    refurbished: false,
    ...query,
    filters,
  } as AppQuery;
  const params = new URLSearchParams();
  const add = (key: string, value: unknown) => value && params.set(key, String(value));
  add('q', appQuery.q);
  add('category', appQuery.category);
  add('format', appQuery.format !== 'all' && appQuery.format);
  add('refurbished', appQuery.refurbished && 'true');
  add('types', filters.types.join(','));
  add('brands', filters.brands.join(','));
  add('conditions', filters.conditions.join(','));
  add('cities', filters.locations.join(','));
  add('minPrice', filters.min && Number(filters.min) * 1000);
  add('maxPrice', filters.max && Number(filters.max) * 1000);
  add('verifiedOnly', filters.verifiedOnly && 'true');
  add('endingSoon', filters.endingSoon && 'true');
  add('sort', appQuery.sort);
  return { appQuery, params };
}

const get = async (params: URLSearchParams) => {
  const response = await fetch(`${base}/listings?${params}`);
  return { status: response.status, body: await response.json() };
};

/** The value each sort orders by, to compare orders without depending on ties. */
const sortValue = (sort: string, item: { priceFils: number; verified: boolean; views: number; auction?: { endsAt: string | number; bidCount: number } }) => {
  switch (sort) {
    case 'price_asc':
    case 'price_desc':
      return item.priceFils;
    case 'ending_soon':
      return item.auction ? new Date(item.auction.endsAt).getTime() : null;
    case 'most_bids':
      return item.auction?.bidCount ?? 0;
    case 'most_viewed':
      return item.views;
    default:
      return item.verified;
  }
};

async function same(query: Query) {
  const { appQuery, params } = both(query);
  params.set('limit', '50');
  const expected = queryListings(pool, appQuery, categoryFilters, now, null, 50);
  const { status, body } = await get(params);
  const label = params.toString();
  assert.equal(status, 200, label);
  assert.equal(body.total, expected.total, `total ${label}`);
  assert.deepEqual(body.counts, expected.counts, `counts ${label}`);
  assert.deepEqual(body.refurbishedCounts, expected.refurbishedCounts, `refurbishedCounts ${label}`);
  // Which listings fill a partial page depends on how ties are broken (the mock:
  // list order; the server: newest first), so compare them only when all fit.
  if (expected.total <= 50)
    assert.deepEqual(
      new Set(body.items.map((i: Item) => i.id)),
      new Set(expected.items.map(i => i.id)),
      `items ${label}`,
    );
  assert.deepEqual(
    body.items.map((i: Item) => sortValue(appQuery.sort, i as never)),
    expected.items.map(i => sortValue(appQuery.sort, i as never)),
    `order ${label}`,
  );
  const sets = (facets: typeof expected.facets) => ({
    categories: new Set(facets.categories),
    conditions: new Set(facets.conditions),
    cities: new Set(facets.cities.map(c => c.id)),
    byCategory: Object.fromEntries(
      Object.entries(facets.byCategory).map(([k, v]) => [k, { types: new Set(v!.types), brands: new Set(v!.brands) }]),
    ),
    maxWarrantyMonths: facets.maxWarrantyMonths,
  });
  assert.deepEqual(sets(body.facets), sets(expected.facets), `facets ${label}`);
  return body;
}

test('same answers as the app’s queryListings: scope, format, refurbished', async () => {
  const all = await same({});
  assert.equal(all.total, 52);
  await same({ format: 'fixed' });
  await same({ format: 'auction', sort: 'ending_soon' });
  await same({ refurbished: true });
  await same({ category: 'mobiles', refurbished: true });
  await same({ category: 'electronics', format: 'auction' });
});

test('same answers: search in Arabic and English, across title, brand, model and type', async () => {
  const arabic = await same({ q: 'ايفون' }); // finds "آيفون" (hamza folded)
  assert.ok(arabic.total > 0);
  assert.ok((await same({ q: 'iphone pro' })).total > 0);
  await same({ q: 'سامسونج' });
  await same({ q: 'phones' });
  assert.equal((await same({ q: 'nothing-matches-this' })).total, 0);
});

test('same answers: every filter and sort', async () => {
  await same({ filters: { brands: ['Apple', 'Samsung'] } });
  await same({ filters: { conditions: ['excellent', 'good'] } });
  await same({ filters: { min: '100', max: '600' }, sort: 'price_asc' });
  await same({ filters: { verifiedOnly: true }, sort: 'price_desc' });
  await same({ filters: { locations: ['amman-khalda', 'irbid', 'amman-abdali'] } });
  await same({ format: 'auction', filters: { endingSoon: true } });
  await same({ category: 'mobiles', filters: { types: ['phones'] }, sort: 'most_viewed' });
  await same({ format: 'auction', sort: 'most_bids' });
});

test('pages: every sort, 7 at a time, covers each listing exactly once in order', async () => {
  for (const sort of ['recommended', 'price_asc', 'price_desc', 'ending_soon', 'most_bids', 'most_viewed']) {
    const seen: Item[] = [];
    let cursor: string | null = null;
    do {
      const params: URLSearchParams = new URLSearchParams({ sort, limit: '7', ...(cursor && { cursor }) });
      const { body } = await get(params);
      seen.push(...body.items);
      cursor = body.nextCursor;
    } while (cursor);
    assert.equal(seen.length, 52, sort);
    assert.equal(new Set(seen.map(i => i.id)).size, 52, `no repeats: ${sort}`);
    const { body: one } = await get(new URLSearchParams({ sort, limit: '50' }));
    const { body: rest } = await get(new URLSearchParams({ sort, limit: '50', cursor: one.nextCursor }));
    assert.deepEqual(seen.map(i => i.id), [...one.items, ...rest.items].map((i: Item) => i.id), `order: ${sort}`);
  }
});

test('ids= returns exactly those listings in that order, skipping unknown ones', async () => {
  const { body } = await get(new URLSearchParams({ ids: 'auction-mobiles,nope,mobiles-1,mobiles-0' }));
  assert.deepEqual(body.items.map((i: Item) => i.id), ['auction-mobiles', 'mobiles-1', 'mobiles-0']);
  assert.equal(body.nextCursor, null);
});

test('the Item shape the app reads', async () => {
  const { body } = await get(new URLSearchParams({ ids: 'auction-mobiles,refurb-store-apple-iphone-13-128' }));
  const [auction, refurbished] = body.items;
  assert.equal(auction.saleType, 'auction');
  assert.ok(!Number.isNaN(Date.parse(auction.auction.endsAt)));
  assert.equal(typeof auction.auction.bidCount, 'number');
  assert.match(auction.testCertificate.imageUrl, /^http:\/\/127\.0\.0\.1:\d+\/static\/certificates\/auction-mobiles\.jpg$/);
  assert.equal((await fetch(auction.testCertificate.imageUrl)).status, 200);
  assert.deepEqual(auction.location.governorate.en.length > 0, true);
  assert.equal(refurbished.sellerId, 'store-apple');
  assert.equal(refurbished.verified, true);
  assert.equal(typeof refurbished.refurbished.warrantyMonths, 'number');
});

test('bad requests are VALIDATION 422', async () => {
  for (const query of ['sort=cheapest', 'minPrice=500&maxPrice=100', 'cursor=garbage', 'limit=500', 'conditions=mint'])
    assert.equal((await get(new URLSearchParams(query))).body.error.code, 'VALIDATION', query);
  const { body: page } = await get(new URLSearchParams({ sort: 'price_asc', limit: '5' }));
  const reused = await get(new URLSearchParams({ sort: 'most_viewed', cursor: page.nextCursor }));
  assert.equal(reused.status, 422); // a cursor from another sort
});
