// Certified Refurbished: the store seed, the import rules
// (POST /admin/refurbished/import) and the Refurbished switch on GET /listings.

import { emptyFilters, queryListings } from '@/lib/browsing';
import {
  importRowToItem,
  validateImportRow,
  type RefurbishedImportRow,
} from '@/lib/refurbishedImport';
import type { ListingQuery } from '@/lib/types';
import { listingParams } from '@/services/catalog/http';
import { buildItems, categoryFilters, cities } from '@/services/mock/catalog';
import { buildRefurbishedItems } from '@/services/mock/refurbished';

const now = 1_700_000_000_000;
const refurbished = buildRefurbishedItems(now);
const pool = [...buildItems(now), ...refurbished];
const base: ListingQuery = {
  format: 'all',
  sort: 'recommended',
  filters: emptyFilters(),
};
const lookups = {
  categoryFilters,
  cityIds: new Set(cities.map(c => c.id)),
  now,
};
const row: RefurbishedImportRow = {
  sku: 'iphone-13-128',
  titleEn: 'iPhone 13 128GB',
  titleAr: 'آيفون 13 - 128 جيجا',
  category: 'mobiles',
  type: 'phones',
  brand: 'Apple',
  model: 'iPhone 13',
  grade: 'like_new',
  warrantyMonths: 12,
  priceJod: 365.5,
  imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  locationId: 'amman-abdali',
  description:
    'Certified refurbished by Apple with a new battery and outer shell, tested on every function.',
};

describe('store seed', () => {
  test('12 brand-store listings, two of them auctions', () => {
    expect(refurbished).toHaveLength(12);
    expect(refurbished.filter(i => i.saleType === 'auction')).toHaveLength(2);
    for (const item of refurbished) {
      expect(item.refurbished).toBeDefined();
      expect(item.condition).toMatch(/^refurbished_/);
      expect(item.sellerId).toMatch(/^store-/);
      expect(item.verified).toBe(true);
    }
  });
});

describe('import rows', () => {
  test('a valid row maps to a refurbished listing sold by the store', () => {
    expect(validateImportRow(row, 0, lookups)).toEqual([]);
    const store = {
      id: 'store-apple',
      name: { ar: 'Apple المعتمد', en: 'Apple Certified' },
    };
    const place = cities.find(c => c.id === 'amman-abdali')!;
    const item = importRowToItem(row, store, place);
    expect(item).toMatchObject({
      category: 'mobiles',
      type: 'phones',
      priceFils: 365500,
      imageUrl: row.imageUrls[0],
      imageUrls: row.imageUrls,
      condition: 'refurbished_like_new',
      sellerId: 'store-apple',
      seller: store.name,
      saleType: 'fixed',
      status: 'active',
      refurbished: { warrantyMonths: 12 },
    });
  });

  test('every bad field is reported with its row', () => {
    const bad = {
      ...row,
      type: 'laptops', // not a mobiles type
      grade: 'mint' as RefurbishedImportRow['grade'],
      warrantyMonths: 40,
      priceJod: 10.1234,
      imageUrls: ['http://insecure.example.com/a.jpg'],
      locationId: 'nowhere',
    };
    const fields = validateImportRow(bad, 4, lookups).map(e => e.field);
    expect(fields).toEqual([
      'type',
      'grade',
      'warrantyMonths',
      'priceJod',
      'imageUrls',
      'locationId',
    ]);
    expect(validateImportRow(bad, 4, lookups)[0]).toMatchObject({
      row: 5,
      sku: 'iphone-13-128',
    });
  });

  test('an auction needs a future end and a raise', () => {
    const past = { ...row, auctionEndsAt: new Date(now - 1).toISOString() };
    expect(validateImportRow(past, 0, lookups).map(e => e.field)).toEqual([
      'auctionEndsAt',
      'auctionIncrementJod',
    ]);
    const auction = {
      ...row,
      auctionEndsAt: new Date(now + 3_600_000).toISOString(),
      auctionIncrementJod: 5,
    };
    expect(validateImportRow(auction, 0, lookups)).toEqual([]);
  });
});

describe('Refurbished switch (GET /listings?refurbished=true)', () => {
  test('only refurbished listings; counts with and without the switch', () => {
    const page = queryListings(
      pool,
      { ...base, refurbished: true },
      categoryFilters,
      now,
    );
    expect(page.total).toBe(12);
    expect(page.items.every(i => i.refurbished)).toBe(true);
    expect(page.refurbishedCounts).toEqual({
      all: pool.length,
      refurbished: 12,
    });
    expect(page.counts).toEqual({ all: 12, fixed: 10, auction: 2 });
  });

  test('combines with the format and category', () => {
    const page = queryListings(
      pool,
      { ...base, category: 'mobiles', format: 'auction' },
      categoryFilters,
      now,
    );
    expect(page.refurbishedCounts).toEqual({ all: 2, refurbished: 1 });
  });

  test('facets give the store its type and brand chips and longest warranty', () => {
    const { facets } = queryListings(
      pool,
      { ...base, refurbished: true },
      categoryFilters,
      now,
    );
    expect(facets.maxWarrantyMonths).toBe(12);
    expect(facets.byCategory.fashion?.brands).toEqual([
      "Levi's",
      'The North Face',
    ]);
    const used = queryListings(pool, base, categoryFilters, now, null);
    expect(used.facets.maxWarrantyMonths).toBe(12);
    expect(
      queryListings(buildItems(now), base, categoryFilters, now).facets
        .maxWarrantyMonths,
    ).toBeUndefined();
  });

  test('query string sends refurbished=true only when on', () => {
    expect(listingParams({ ...base, refurbished: true })).toBe(
      'refurbished=true&sort=recommended',
    );
    expect(listingParams({ ...base, refurbished: false })).toBe(
      'sort=recommended',
    );
  });
});
