import { emptyFilters, queryListings } from '@/lib/browsing';
import type { ListingQuery } from '@/lib/types';
import { listingParams } from '@/services/catalog/http';
import { buildItems, categoryFilters } from '@/services/mock/catalog';

const now = 1_700_000_000_000;
const pool = buildItems(now);
const base: ListingQuery = {
  format: 'all',
  sort: 'recommended',
  filters: emptyFilters(),
};

describe('server-side listings (GET /listings)', () => {
  test('pages through every match exactly once', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = queryListings(pool, base, categoryFilters, now, cursor, 7);
      expect(page.items.length).toBeLessThanOrEqual(7);
      seen.push(...page.items.map(i => i.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    const { total } = queryListings(pool, base, categoryFilters, now);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(pages).toBe(Math.ceil(total / 7));
  });

  test('format counts and facets cover the whole query, not one page', () => {
    const page = queryListings(pool, base, categoryFilters, now, null, 2);
    expect(page.items).toHaveLength(2);
    expect(page.counts.all).toBe(page.counts.fixed + page.counts.auction);
    expect(page.total).toBe(page.counts.all);
    expect(page.facets.categories.length).toBe(8);
  });

  test('category, search and ids narrow the results', () => {
    const tech = queryListings(
      pool,
      { ...base, category: 'tech' },
      categoryFilters,
      now,
    );
    expect(tech.items.every(i => i.category === 'tech')).toBe(true);

    const iphone = queryListings(
      pool,
      { ...base, q: 'iphone' },
      categoryFilters,
      now,
    );
    expect(iphone.total).toBeGreaterThan(0);
    expect(
      iphone.items.every(i => /iphone/i.test(i.title.en + i.title.ar)),
    ).toBe(true);

    const byIds = queryListings(
      pool,
      { ...base, ids: ['tech-1', 'tech-0', 'missing'] },
      categoryFilters,
      now,
    );
    expect(byIds.items.map(i => i.id)).toEqual(['tech-1', 'tech-0']);
  });

  test('query string sends only what is set, prices in fils', () => {
    expect(listingParams(base)).toBe('sort=recommended');
    expect(
      listingParams(
        {
          q: ' iphone 14 ',
          category: 'tech',
          format: 'auction',
          sort: 'ending_soon',
          filters: {
            ...emptyFilters(),
            brands: ['Apple', 'Samsung'],
            min: '10',
            max: '12.5',
            verifiedOnly: true,
          },
        },
        '40',
      ),
    ).toBe(
      'q=iphone%2014&category=tech&format=auction&brands=Apple%2CSamsung' +
        '&minPrice=10000&maxPrice=12500&verifiedOnly=true&sort=ending_soon&cursor=40',
    );
    expect(listingParams({ ...base, ids: ['a', 'b'] })).toBe('ids=a%2Cb');
  });
});
