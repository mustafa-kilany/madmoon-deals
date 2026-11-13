// Seed for the Certified Refurbished store (prototype getRefurbishedItems):
// brand-certified listings sold by each brand's official store, with a
// warranty, always at a fixed price (vendors set it). They sit in their normal
// category, so category and search browsing show them too. The rows are in
// the import format (lib/refurbishedImport) and go through the same checks
// and mapping as POST /admin/refurbished/import.

import {
  importRowToItem,
  validateImportRow,
  type RefurbishedImportRow,
} from '@/lib/refurbishedImport';
import type { Item, Localized } from '@/lib/types';
import { categoryFilters } from './catalog';
import { cities } from './places';

const unsplash = (photo: string) =>
  `https://images.unsplash.com/${photo}?w=400&h=400&fit=crop`;

/** A brand's official store account: the seller of its refurbished listings. */
const storeOf = (brand: string): { id: string; name: Localized } => ({
  id: `store-${brand.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  name: { ar: `${brand} المعتمد`, en: `${brand} Certified` },
});

type Seed = RefurbishedImportRow & {
  /** Demo only: view count. */
  views: number;
};

const seeds: Seed[] = [
  {
    sku: 'iphone-13-128',
    titleAr: 'آيفون 13 - 128 جيجا',
    titleEn: 'iPhone 13 128GB',
    priceJod: 365,
    imageUrls: [unsplash('photo-1632582593957-e28f748ba619')],
    category: 'mobiles',
    type: 'phones',
    brand: 'Apple',
    model: 'iPhone 13',
    grade: 'like_new',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Certified refurbished by Apple: new battery and outer shell, original parts only, tested on every function. Comes in a new box with a USB-C to Lightning cable.',
    views: 412,
  },
  {
    sku: 'galaxy-s23-256',
    titleAr: 'سامسونج جالكسي S23 - 256 جيجا',
    titleEn: 'Galaxy S23 256GB',
    priceJod: 330,
    imageUrls: [unsplash('photo-1707438095940-1eee18e85400')],
    category: 'mobiles',
    type: 'phones',
    brand: 'Samsung',
    model: 'Galaxy S23',
    grade: 'excellent',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Refurbished by Samsung with genuine parts and a full 50-point check. The screen and battery are like new. Ships in a Samsung box with a charging cable.',
    views: 268,
  },
  {
    sku: 'macbook-air-m1',
    titleAr: 'ماك بوك إير M1 13 إنش',
    titleEn: 'MacBook Air M1 13"',
    priceJod: 520,
    imageUrls: [unsplash('photo-1611186871348-b1ce696e52c9')],
    category: 'electronics',
    type: 'laptops',
    brand: 'Apple',
    model: 'MacBook Air M1',
    grade: 'like_new',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Apple certified refurbished MacBook Air with M1 chip, 8GB memory and 256GB SSD. New battery and outer case, with the latest macOS installed. Includes the 30W charger.',
    views: 305,
  },
  {
    sku: 'xps-13-i7',
    titleAr: 'ديل XPS 13 - كور i7',
    titleEn: 'Dell XPS 13 Core i7',
    priceJod: 445,
    imageUrls: [unsplash('photo-1593642702821-c8da6771f0c6')],
    category: 'electronics',
    type: 'laptops',
    brand: 'Dell',
    model: 'XPS 13',
    grade: 'excellent',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Dell refurbished XPS 13 with Core i7, 16GB RAM and 512GB SSD. Fully tested, cleaned and reset to factory settings. Light marks on the lid at most. Original charger included.',
    views: 141,
  },
  {
    sku: 'elitebook-840',
    titleAr: 'لابتوب HP EliteBook 840',
    titleEn: 'HP EliteBook 840 Laptop',
    priceJod: 210,
    imageUrls: [unsplash('photo-1619597455322-4fbbd820250a')],
    category: 'electronics',
    type: 'laptops',
    brand: 'HP',
    model: 'EliteBook 840',
    grade: 'good',
    warrantyMonths: 6,
    locationId: 'amman-abdali',
    description:
      'HP business-grade refurbished EliteBook 840 with Core i5, 8GB RAM and 256GB SSD. Keyboard, battery and screen tested. Visible wear on the case, which is why it is graded good.',
    views: 96,
  },
  {
    sku: 'ipad-air-5',
    titleAr: 'آيباد إير - الجيل الخامس',
    titleEn: 'iPad Air (5th gen)',
    priceJod: 285,
    imageUrls: [unsplash('photo-1553103291-346188e304d2')],
    category: 'mobiles',
    type: 'tablets',
    brand: 'Apple',
    model: 'iPad Air (5th gen)',
    grade: 'excellent',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Apple certified refurbished iPad Air (5th generation), 64GB Wi-Fi. Every iPad gets a new battery and outer shell and a full test. Ships in a new white box with a USB-C cable.',
    views: 187,
  },
  {
    sku: 'wh-1000xm4',
    titleAr: 'سماعات سوني WH-1000XM4',
    titleEn: 'Sony WH-1000XM4',
    priceJod: 115,
    imageUrls: [unsplash('photo-1548378329-437e1ef34263')],
    category: 'electronics',
    type: 'audio',
    brand: 'Sony',
    model: 'WH-1000XM4',
    grade: 'like_new',
    warrantyMonths: 6,
    locationId: 'amman-abdali',
    description:
      'Sony refurbished WH-1000XM4 headphones with industry-leading noise cancelling. New ear pads, tested for sound, Bluetooth and battery. Includes the carry case and cables.',
    views: 233,
  },
  {
    sku: 'watch-series-8',
    titleAr: 'ساعة آبل - السلسلة 8',
    titleEn: 'Apple Watch Series 8',
    priceJod: 165,
    imageUrls: [unsplash('photo-1614106765035-bceac4ac1911')],
    category: 'mobiles',
    type: 'smartwatches',
    brand: 'Apple',
    model: 'Apple Watch Series 8',
    grade: 'good',
    warrantyMonths: 6,
    locationId: 'amman-abdali',
    description:
      'Apple refurbished Apple Watch Series 8, 45mm GPS. Battery tested above 85%, the screen may show light marks. Comes with a new sport band and the magnetic charger.',
    views: 159,
  },
  {
    sku: '501-jeans',
    titleAr: 'جينز ليفايس 501',
    titleEn: "Levi's 501 Jeans",
    priceJod: 18,
    imageUrls: [unsplash('photo-1714143136372-ddaf8b606da7')],
    category: 'fashion',
    type: 'men',
    brand: "Levi's",
    grade: 'excellent',
    warrantyMonths: 0,
    locationId: 'amman-abdali',
    description:
      "Levi's certified pre-owned 501 Original Fit jeans, inspected, cleaned and repaired by Levi's tailors. Size W32 L32. Light fading that fits the vintage look.",
    views: 88,
  },
  {
    sku: 'nuptse-puffer',
    titleAr: 'جاكيت منفوخ The North Face',
    titleEn: 'The North Face Puffer',
    priceJod: 55,
    imageUrls: [unsplash('photo-1706765779494-2705542ebe74')],
    category: 'fashion',
    type: 'men',
    brand: 'The North Face',
    grade: 'like_new',
    warrantyMonths: 0,
    locationId: 'amman-abdali',
    description:
      'The North Face Renewed jacket: returned, inspected and cleaned by the brand, with any small repairs done. Size M, warm 700-fill down, with no rips or stains.',
    views: 124,
  },
  {
    sku: 'ps5-disc',
    titleAr: 'بلايستيشن 5 - نسخة الأقراص',
    titleEn: 'PlayStation 5 Disc Edition',
    priceJod: 260,
    imageUrls: [unsplash('photo-1622297845775-5ff3fef71d13')],
    category: 'electronics',
    type: 'gaming',
    brand: 'Sony',
    model: 'PlayStation 5 (Disc)',
    grade: 'excellent',
    warrantyMonths: 6,
    locationId: 'amman-abdali',
    description:
      'Sony refurbished PlayStation 5 Disc Edition, tested on games, disc drive, Wi-Fi and every port. Includes one DualSense controller and all the cables, in a plain box.',
    views: 520,
  },
  {
    sku: 'galaxy-tab-s8',
    titleAr: 'سامسونج جالكسي تاب S8',
    titleEn: 'Galaxy Tab S8',
    priceJod: 210,
    imageUrls: [unsplash('photo-1628866971124-5d506bf12915')],
    category: 'mobiles',
    type: 'tablets',
    brand: 'Samsung',
    model: 'Galaxy Tab S8',
    grade: 'like_new',
    warrantyMonths: 12,
    locationId: 'amman-abdali',
    description:
      'Samsung refurbished Galaxy Tab S8 with 128GB storage and the S Pen. Battery and screen tested like new, with genuine parts. Ships with a USB-C charging cable.',
    views: 377,
  },
];

const cityIds = new Set(cities.map(c => c.id));

/** The store's listings. */
export function buildRefurbishedItems(): Item[] {
  return seeds.map(({ views, ...row }, index) => {
    const errors = validateImportRow(row, index, {
      categoryFilters,
      cityIds,
    });
    if (errors.length)
      throw new Error(`Bad refurbished seed: ${JSON.stringify(errors)}`);
    const { id, name, governorate } = cities.find(
      c => c.id === row.locationId,
    )!;
    const item = importRowToItem(row, storeOf(row.brand), {
      id,
      name,
      governorate,
    });
    return { ...item, views };
  });
}
