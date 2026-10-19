import {
  buildItems,
  categories,
  categoryFilters,
} from '@/services/mock/catalog';

describe('mock catalog', () => {
  const start = 1_700_000_000_000;
  const items = buildItems(start);

  test('4 listings + 1 auction per category, with unique ids', () => {
    expect(categories).toHaveLength(8);
    expect(items).toHaveLength(40);
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });

  test('every listing type exists in its category filters', () => {
    for (const item of items) {
      const typeIds = categoryFilters[item.category].types.map(t => t.id);
      expect(typeIds).toContain(item.type);
    }
  });

  test('tech demo auction matches the prototype', () => {
    const auction = items.find(i => i.id === 'auction-tech');
    expect(auction?.title.en).toBe('iPhone 14 Pro Max 256GB');
    expect(auction?.priceFils).toBe(450000);
    expect(auction?.auction).toEqual({
      endsAt: start + 45 * 60 * 1000,
      bidCount: 18,
      incrementFils: 10000,
    });
  });

  test('prices are integer fils', () => {
    for (const item of items)
      expect(Number.isInteger(item.priceFils)).toBe(true);
  });
});
