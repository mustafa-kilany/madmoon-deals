import {
  emptyFilters,
  filterCount,
  filterItems,
  searchItems,
  sortItems,
  timeLeft,
  validPriceRange,
} from '@/lib/browsing';
import { buildItems, categoryFilters } from '@/services/mock/catalog';

const start = 1_700_000_000_000;
const items = buildItems(start);
const ids = (list: { id: string }[]) => list.map(i => i.id);

describe('filterItems', () => {
  test('format tabs split fixed-price listings and auctions', () => {
    const mobiles = { ...emptyFilters(), category: 'mobiles' as const };
    expect(filterItems(items, mobiles, 'all', start)).toHaveLength(5);
    expect(filterItems(items, mobiles, 'fixed', start)).toHaveLength(4);
    expect(ids(filterItems(items, mobiles, 'auction', start))).toEqual([
      'auction-mobiles',
    ]);
  });

  test('ended auctions are hidden', () => {
    const later = start + 46 * 60 * 1000; // mobiles auction ran 45 minutes
    const live = filterItems(items, emptyFilters(), 'auction', later);
    expect(ids(live)).not.toContain('auction-mobiles');
    expect(live).toHaveLength(7);
  });

  test('price range compares whole dinars against fils', () => {
    const f = {
      ...emptyFilters(),
      category: 'mobiles' as const,
      min: '110',
      max: '330',
    };
    // 110 and 330 JOD are inclusive; the 520 JOD iPhone is out
    expect(ids(filterItems(items, f, 'fixed', start)).sort()).toEqual([
      'mobiles-1',
      'mobiles-2',
      'mobiles-3',
    ]);
  });

  test('an invalid range shows nothing', () => {
    const f = { ...emptyFilters(), min: '50', max: '10' };
    expect(validPriceRange(f)).toBe(false);
    expect(filterItems(items, f, 'all', start)).toEqual([]);
    expect(validPriceRange({ ...emptyFilters(), min: '-1' })).toBe(false);
  });

  test('conditions, locations, types and brands match by id', () => {
    const f = {
      ...emptyFilters(),
      conditions: ['new' as const],
      brands: ['Apple'],
    };
    expect(ids(filterItems(items, f, 'all', start))).toEqual(['mobiles-3']);
    const amman = { ...emptyFilters(), locations: ['amman'] };
    expect(
      filterItems(items, amman, 'all', start).every(
        i => i.location.id === 'amman',
      ),
    ).toBe(true);
  });

  test('ending soon keeps only auctions ending within 24h', () => {
    const f = { ...emptyFilters(), endingSoon: true };
    const result = filterItems(items, f, 'all', start);
    expect(result.every(i => i.saleType === 'auction')).toBe(true);
    // vehicles (20h) qualifies; hobbies (40h) doesn't
    expect(ids(result)).toContain('auction-vehicles');
    expect(ids(result)).not.toContain('auction-hobbies');
  });
});

describe('sortItems', () => {
  test('recommended puts verified sellers first', () => {
    const sorted = sortItems(items, 'recommended');
    const firstUnverified = sorted.findIndex(i => !i.verified);
    expect(sorted.slice(firstUnverified).every(i => !i.verified)).toBe(true);
  });

  test('price and auction sorts', () => {
    const asc = sortItems(items, 'price_asc').map(i => i.priceFils);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const auctions = items.filter(i => i.auction);
    expect(sortItems(auctions, 'ending_soon')[0].id).toBe('auction-mobiles');
    expect(sortItems(auctions, 'most_bids')[0].id).toBe('auction-mobiles');
  });
});

test('filterCount counts a price range once', () => {
  expect(
    filterCount({
      ...emptyFilters(),
      min: '1',
      max: '9',
      brands: ['Sony', 'Apple'],
      verifiedOnly: true,
    }),
  ).toBe(4);
});

test('search matches either language and type names', () => {
  expect(ids(searchItems(items, 'macbook', categoryFilters))).toEqual([
    'electronics-0',
  ]);
  expect(ids(searchItems(items, 'لابتوب', categoryFilters))).toEqual([
    'electronics-0',
  ]);
  // "هواتف" (Phones) appears only as a type name: both phones + the iPhone auction
  expect(ids(searchItems(items, 'هواتف', categoryFilters)).sort()).toEqual([
    'auction-mobiles',
    'mobiles-0',
    'mobiles-1',
  ]);
  expect(searchItems(items, '  ', categoryFilters)).toHaveLength(items.length);
});

test('timeLeft shows the two largest units', () => {
  const s = 1000;
  expect(timeLeft(start + (2 * 86400 + 4 * 3600) * s, start)).toEqual({
    unit: 'days',
    days: 2,
    hours: 4,
  });
  expect(timeLeft(start + (44 * 60 + 54) * s, start)).toEqual({
    unit: 'minutes',
    minutes: 44,
    seconds: 54,
  });
  expect(timeLeft(start - 1, start)).toEqual({ unit: 'ended' });
});
