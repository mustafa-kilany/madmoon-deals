// POST /admin/refurbished/import, the part that needs no database: check every
// row with the app's own rules (frontend/src/lib/refurbishedImport.ts) and decide what
// happens to each sku. service.ts then saves the plan.

import { jod } from '@/lib/money';
import {
  validateImportRow,
  type ImportRowError,
  type RefurbishedImportRow,
} from '@/lib/refurbishedImport';
import { categoryFilters, cityIds } from '../../reference';

/** The listing columns an import row sets (store and sku identify it). */
export type ListingFields = {
  category: string;
  type: string;
  titleAr: string;
  titleEn: string;
  priceFils: number;
  imageUrls: string[];
  condition: 'refurbished_like_new' | 'refurbished_excellent' | 'refurbished_good';
  description: string;
  brand: string;
  model: string | null;
  locationId: string;
  saleType: 'fixed' | 'auction';
  auctionEndsAt: Date | null;
  incrementFils: number | null;
  warrantyMonths: number;
  status: 'active';
};

/** A listing of this store that already exists, as far as the plan needs it. */
export type ExistingListing = Omit<ListingFields, 'status'> & {
  id: string;
  sku: string;
  status: 'active' | 'reserved' | 'sold' | 'withdrawn';
};

export type ImportPlan = {
  create: { sku: string; fields: ListingFields }[];
  update: { id: string; sku: string; fields: ListingFields }[];
  /** Replace mode: the store's listings that aren't in this import. */
  withdraw: { id: string; sku: string }[];
  errors: ImportRowError[];
};

/** Refurbished stock is always fixed price (vendors set it): no auction columns. */
export function toListingFields(row: RefurbishedImportRow): ListingFields {
  return {
    category: row.category,
    type: row.type,
    titleAr: row.titleAr.trim(),
    titleEn: row.titleEn.trim(),
    priceFils: jod(row.priceJod),
    imageUrls: row.imageUrls,
    condition: `refurbished_${row.grade}`,
    description: row.description.trim(),
    brand: row.brand.trim(),
    model: row.model?.trim() || null,
    locationId: row.locationId,
    saleType: 'fixed',
    auctionEndsAt: null,
    incrementFils: null,
    warrantyMonths: row.warrantyMonths,
    status: 'active',
  };
}

/** Would saving `fields` change nothing? (A withdrawn sku coming back is a change.) */
const unchanged = (current: ExistingListing, fields: ListingFields) =>
  (Object.keys(fields) as (keyof ListingFields)[]).every(key => {
    const x = current[key];
    const y = fields[key];
    if (x instanceof Date || y instanceof Date)
      return (x as Date | null)?.getTime() === (y as Date | null)?.getTime();
    if (Array.isArray(x)) return JSON.stringify(x) === JSON.stringify(y);
    return x === y;
  });

export function planImport(
  rows: RefurbishedImportRow[],
  existing: ExistingListing[],
  mode: 'upsert' | 'replace',
): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], withdraw: [], errors: [] };
  const bySku = new Map(existing.map(listing => [listing.sku, listing]));
  const seen = new Set<string>();
  const lookups = { categoryFilters, cityIds };

  rows.forEach((row, index) => {
    const errors = validateImportRow(row, index, lookups);
    if (errors.length === 0 && seen.has(row.sku))
      errors.push({
        row: index + 1,
        sku: row.sku,
        field: 'sku',
        message: 'Appears twice in this import',
      });
    if (typeof row.sku === 'string') seen.add(row.sku);
    const current = bySku.get(row.sku);
    if (errors.length === 0 && current?.status === 'reserved')
      errors.push({
        row: index + 1,
        sku: row.sku,
        field: 'sku',
        message: 'Has an open order (paid, not delivered yet): not changed',
      });
    if (errors.length === 0 && current?.status === 'sold')
      errors.push({
        row: index + 1,
        sku: row.sku,
        field: 'sku',
        message: 'Already sold: give restocked items a new sku',
      });
    if (errors.length > 0) {
      plan.errors.push(...errors);
      return;
    }

    const fields = toListingFields(row);
    if (!current) plan.create.push({ sku: row.sku, fields });
    else if (!unchanged(current, fields))
      plan.update.push({ id: current.id, sku: row.sku, fields });
  });

  // A row with errors is still part of the sheet: don't withdraw its listing.
  if (mode === 'replace')
    for (const listing of existing)
      if (listing.status === 'active' && !seen.has(listing.sku))
        plan.withdraw.push({ id: listing.id, sku: listing.sku });

  return plan;
}
