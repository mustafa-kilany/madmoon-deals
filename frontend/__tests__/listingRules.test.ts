// Listing rules: descriptions of 10+ words, shop test certificates on phones
// and electronics (POST /test-certificates → POST /listings), and the street
// lookup for the delivery address (GET /geocode/reverse).

import { addressAt } from '../src/features/checkout/hooks/useDeliveryLocation';
import {
  countWords,
  descriptionValid,
  needsTestCertificate,
} from '../src/lib/listing';
import { jod } from '../src/lib/money';
import { mockCatalogService as catalog } from '../src/services/catalog/mock';
import type { CreateListingInput } from '../src/services/catalog/types';
import {
  buildItems,
  categoryFilters,
  cities,
} from '../src/services/mock/catalog';
import { buildRefurbishedItems } from '../src/services/mock/refurbished';

const now = 1_700_000_000_000;
const seed = [...buildItems(now), ...buildRefurbishedItems(now)];
const typeOf = (category: keyof typeof categoryFilters, type: string) =>
  categoryFilters[category].types.find(t => t.id === type);

const photo = {
  uri: 'file:///cert.jpg',
  mimeType: 'image/jpeg',
  fileName: 'cert.jpg',
};
const phone: CreateListingInput = {
  category: 'mobiles',
  titleAr: 'سامسونج جالكسي S24',
  titleEn: 'Samsung Galaxy S24',
  priceFils: jod(400),
  imageUrls: ['file:///p.jpg'],
  condition: 'excellent',
  description:
    'Used for a year with a case and screen protector, battery health 90%, no repairs.',
  brand: 'Samsung',
  model: 'Galaxy S24',
  type: 'phones',
  locationId: 'salt',
  saleType: 'fixed',
};

describe('descriptions', () => {
  test('words have a letter or digit, in Arabic or English', () => {
    expect(countWords('  Battery 89%, no   scratches.\n\nBox included ')).toBe(
      6,
    );
    expect(countWords('الجهاز شغال 100% بدون مشاكل')).toBe(5);
    expect(countWords('- - - 🙂 🙂 ...')).toBe(0);
  });

  test('need at least 10 words and at most 2000 characters', () => {
    expect(descriptionValid(undefined)).toBe(false);
    expect(
      descriptionValid('one two three four five six seven eight nine'),
    ).toBe(false);
    expect(
      descriptionValid('one two three four five six seven eight nine ten'),
    ).toBe(true);
    expect(descriptionValid(`${'word '.repeat(401)}`.trim())).toBe(false);
  });

  test('every seed listing has one', () => {
    const missing = seed.filter(item => !descriptionValid(item.description));
    expect(missing.map(item => item.id)).toEqual([]);
  });

  test('POST /listings refuses a short one', async () => {
    await expect(
      catalog.createListing({
        ...phone,
        category: 'fashion',
        type: 'men',
        description: 'Nice jacket, barely worn.',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('shop test certificates', () => {
  test('phones and electronics need one; accessories, cars and clothes do not', () => {
    expect(needsTestCertificate(typeOf('mobiles', 'phones'))).toBe(true);
    expect(needsTestCertificate(typeOf('electronics', 'laptops'))).toBe(true);
    expect(needsTestCertificate(typeOf('mobiles', 'accessories'))).toBe(false);
    expect(needsTestCertificate(typeOf('vehicles', 'cars'))).toBe(false);
    expect(needsTestCertificate(typeOf('fashion', 'men'))).toBe(false);
  });

  test('every seed phone and electronics listing carries one, except brand stores', () => {
    const tested = seed.filter(
      item =>
        !item.refurbished &&
        needsTestCertificate(typeOf(item.category, item.type)),
    );
    expect(tested.length).toBeGreaterThan(0);
    for (const item of tested) {
      expect(item.testCertificate?.shopName).toBeTruthy();
      expect(item.testCertificate?.specs.length).toBeGreaterThan(0);
    }
  });

  test('a phone without a passed certificate is refused', async () => {
    await expect(catalog.createListing(phone)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      catalog.createListing({ ...phone, testCertificateId: 'made-up' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('checked for this device, it goes on the listing, once', async () => {
    const check = await catalog.checkTestCertificate({
      photo,
      category: 'mobiles',
      type: 'phones',
      brand: 'Samsung',
      model: 'Galaxy S24',
    });
    expect(check.status).toBe('passed');
    expect(check.device).toBe('Samsung Galaxy S24');

    // Another model than the one on the report
    await expect(
      catalog.createListing({
        ...phone,
        model: 'Galaxy S23',
        testCertificateId: check.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const item = await catalog.createListing({
      ...phone,
      testCertificateId: check.id,
    });
    expect(item.testCertificate).toMatchObject({
      image: { uri: photo.uri },
      shopName: check.shopName,
      specs: check.specs,
    });

    // One report, one listing
    await expect(
      catalog.createListing({ ...phone, testCertificateId: check.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('delivery address from GPS', () => {
  const street = jest.fn(async () => 'Mecca St');
  beforeEach(() => street.mockClear());

  test('a precise fix gives the area and the street', async () => {
    const found = await addressAt(
      { lat: 32.039, lng: 35.727, accuracy: 20 },
      cities,
      street,
    );
    expect(found).toEqual({ cityId: 'salt', address: 'Mecca St' });
  });

  test('a rough fix gives only the area, without asking for the street', async () => {
    const found = await addressAt(
      { lat: 32.039, lng: 35.727, accuracy: 2000 },
      cities,
      street,
    );
    expect(found).toEqual({ cityId: 'salt', address: '' });
    expect(street).not.toHaveBeenCalled();
  });

  test('a failed street lookup still gives the area', async () => {
    const found = await addressAt(
      { lat: 32.039, lng: 35.727, accuracy: 20 },
      cities,
      async () => {
        throw new Error('offline');
      },
    );
    expect(found).toEqual({ cityId: 'salt', address: '' });
  });

  test('outside Jordan (the emulator sits in California) gives nothing', async () => {
    const found = await addressAt(
      { lat: 37.422, lng: -122.084, accuracy: 5 },
      cities,
      street,
    );
    expect(found).toEqual({ address: '' });
  });

  test('the mock names a street in the nearest area, in the app language', async () => {
    // Downtown Salt
    const position = { lat: 32.039, lng: 35.727 };
    expect(await catalog.reverseGeocode(position, 'en')).toContain('Salt');
    expect(await catalog.reverseGeocode(position, 'ar')).toContain('السلط');
  });
});
