// Certified Refurbished import (docs/API.md → POST /admin/refurbished/import).
// Refurbished stock is never listed in the app: a brand's system sends it to
// the API, or the admin dashboard reads it from the Excel template
// (docs/refurbished-import-template.csv) and sends the same rows. These are
// the rules the server applies to each row; the mock seed
// (services/mock/refurbished.ts) is imported through them too.

import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN_WORDS,
  descriptionValid,
} from './listing';
import { jod } from './money';
import type {
  CategoryFilters,
  CategoryId,
  Item,
  Localized,
  Place,
} from './types';

export type RefurbishedGrade = 'like_new' | 'excellent' | 'good';

/** One listing, one row of the Excel sheet. */
export type RefurbishedImportRow = {
  /** The store's own id for the item; importing the same sku again updates that listing. */
  sku: string;
  titleEn: string;
  titleAr: string;
  category: CategoryId;
  /** Item type id within the category (GET /categories/filters). */
  type: string;
  brand: string;
  model?: string;
  grade: RefurbishedGrade;
  /** 0 to 36; 0 = brand-inspected, no warranty. */
  warrantyMonths: number;
  /** JOD with up to 3 decimals (easy to type in Excel); stored as fils. Auctions: the opening bid. */
  priceJod: number;
  /** 1 to 5 public https photo URLs, cover first. Excel: one cell, separated by "|". */
  imageUrls: string[];
  /** Area id (GET /cities), e.g. "amman-abdali". */
  locationId: string;
  /** At least 10 words, up to 2000 characters. */
  description: string;
  /** Sell by auction instead: end time (ISO-8601) and the minimum raise in JOD. */
  auctionEndsAt?: string;
  auctionIncrementJod?: number;
};

/** `row` is the row's 1-based position in `items` (Excel row = row + 1, after the header). */
export type ImportRowError = {
  row: number;
  sku?: string;
  field: keyof RefurbishedImportRow;
  message: string;
};

export const GRADES: RefurbishedGrade[] = ['like_new', 'excellent', 'good'];
export const MAX_WARRANTY_MONTHS = 36;
export const MAX_PHOTOS = 5;

type Lookups = {
  categoryFilters: Record<CategoryId, CategoryFilters>;
  cityIds: Set<string>;
  now: number;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;
const hasFils = (value: number) =>
  Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6;

/** Every problem with one row (empty = valid). Rows with problems are skipped, not saved. */
export function validateImportRow(
  row: RefurbishedImportRow,
  index: number,
  { categoryFilters, cityIds, now }: Lookups,
): ImportRowError[] {
  const errors: ImportRowError[] = [];
  const fail = (field: keyof RefurbishedImportRow, message: string) =>
    errors.push({ row: index + 1, sku: row.sku || undefined, field, message });

  if (!text(row.sku, 64)) fail('sku', 'Required, up to 64 characters');
  if (!text(row.titleEn, 120))
    fail('titleEn', 'Required, up to 120 characters');
  if (!text(row.titleAr, 120))
    fail('titleAr', 'Required, up to 120 characters');
  const category = categoryFilters[row.category];
  if (!category) fail('category', 'Unknown category id');
  else if (!category.types.some(t => t.id === row.type))
    fail('type', `Not an item type of ${row.category}`);
  if (!text(row.brand, 60)) fail('brand', 'Required, up to 60 characters');
  if (row.model !== undefined && !text(row.model, 60))
    fail('model', 'Up to 60 characters');
  if (!GRADES.includes(row.grade)) fail('grade', `One of ${GRADES.join(', ')}`);
  if (
    !Number.isInteger(row.warrantyMonths) ||
    row.warrantyMonths < 0 ||
    row.warrantyMonths > MAX_WARRANTY_MONTHS
  )
    fail('warrantyMonths', `Whole months, 0 to ${MAX_WARRANTY_MONTHS}`);
  if (
    typeof row.priceJod !== 'number' ||
    !(row.priceJod > 0) ||
    !hasFils(row.priceJod)
  )
    fail('priceJod', 'Above 0, at most 3 decimals');
  if (
    !Array.isArray(row.imageUrls) ||
    row.imageUrls.length < 1 ||
    row.imageUrls.length > MAX_PHOTOS ||
    !row.imageUrls.every(u => /^https:\/\/\S+$/.test(u))
  )
    fail('imageUrls', `1 to ${MAX_PHOTOS} https URLs`);
  if (!cityIds.has(row.locationId)) fail('locationId', 'Unknown area id');
  if (typeof row.description !== 'string' || !descriptionValid(row.description))
    fail(
      'description',
      `Required: at least ${DESCRIPTION_MIN_WORDS} words, up to ${DESCRIPTION_MAX} characters`,
    );
  if (row.auctionEndsAt !== undefined) {
    const endsAt = Date.parse(row.auctionEndsAt);
    if (!(endsAt > now))
      fail('auctionEndsAt', 'An ISO-8601 time in the future');
    if (
      typeof row.auctionIncrementJod !== 'number' ||
      !(row.auctionIncrementJod > 0) ||
      !hasFils(row.auctionIncrementJod)
    )
      fail('auctionIncrementJod', 'Required for auctions: above 0 JOD');
  }
  return errors;
}

/**
 * A valid row as the listing the app sees. `store` is the brand's official
 * store account (the seller), e.g. { id: 'store-apple', name: Apple Certified }.
 */
export function importRowToItem(
  row: RefurbishedImportRow,
  store: { id: string; name: Localized },
  location: Place,
): Item {
  const endsAt = row.auctionEndsAt ? Date.parse(row.auctionEndsAt) : undefined;
  return {
    id: `refurb-${store.id}-${row.sku}`,
    category: row.category,
    title: { ar: row.titleAr.trim(), en: row.titleEn.trim() },
    priceFils: jod(row.priceJod),
    imageUrl: row.imageUrls[0],
    ...(row.imageUrls.length > 1 && { imageUrls: row.imageUrls }),
    condition: `refurbished_${row.grade}`,
    seller: store.name,
    sellerId: store.id,
    description: row.description.trim(),
    status: 'active',
    brand: row.brand.trim(),
    model: row.model?.trim() || undefined,
    type: row.type,
    verified: true,
    location,
    saleType: endsAt === undefined ? 'fixed' : 'auction',
    auction:
      endsAt === undefined
        ? undefined
        : {
            endsAt,
            bidCount: 0,
            incrementFils: jod(row.auctionIncrementJod ?? 1),
          },
    views: 0,
    refurbished: { warrantyMonths: row.warrantyMonths },
  };
}
