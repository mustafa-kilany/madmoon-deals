import { searchItems } from '@/lib/browsing';
import { foldText } from '@/lib/text';
import { buildItems, categoryFilters } from '@/services/mock/catalog';

const type = (category: keyof typeof categoryFilters, id: string) =>
  categoryFilters[category].types.find(t => t.id === id)!;

describe('brand catalogue', () => {
  test('every item type has brands (books have publishers, not brands)', () => {
    for (const filters of Object.values(categoryFilters)) {
      for (const t of filters.types) {
        if (t.id === 'books') continue;
        expect(t.brands?.length).toBeGreaterThan(5);
      }
    }
  });

  test('no brand is listed twice within a type', () => {
    for (const filters of Object.values(categoryFilters)) {
      for (const t of filters.types) {
        expect(new Set(t.brands).size).toBe(t.brands?.length ?? 0);
      }
    }
  });

  test('models only exist for brands the type lists, without repeats', () => {
    for (const filters of Object.values(categoryFilters)) {
      for (const t of filters.types) {
        for (const [brand, models] of Object.entries(t.models ?? {})) {
          expect(t.brands).toContain(brand);
          expect(new Set(models).size).toBe(models.length);
        }
      }
    }
  });

  test('category brands are the union of its types', () => {
    const cars = type('vehicles', 'cars');
    expect(cars.models?.Toyota).toContain('Land Cruiser');
    expect(categoryFilters.vehicles.brands).toEqual(
      expect.arrayContaining(['Toyota', 'Michelin', 'Harley-Davidson']),
    );
    expect(type('mobiles', 'phones').models?.Apple).toContain('iPhone 15 Pro');
  });

  test('seed listings use listed brands and models', () => {
    for (const item of buildItems(0)) {
      const t = type(item.category, item.type);
      if (item.brand) expect(t.brands).toContain(item.brand);
      if (item.model) expect(t.models?.[item.brand!]).toContain(item.model);
    }
  });
});

describe('search', () => {
  test('finds listings by model and forgives Arabic spelling', () => {
    const items = buildItems(0);
    const ids = (q: string) =>
      searchItems(items, q, categoryFilters).map(i => i.id);
    expect(ids('cerato')).toContain('vehicles-0');
    expect(ids('ايفون')).toContain('mobiles-0');
  });

  test('foldText', () => {
    expect(foldText('  إربد ')).toBe('اربد');
    expect(foldText('مُسْتَشْفى')).toBe('مستشفي');
    expect(foldText('iPhone')).toBe('iphone');
  });
});
