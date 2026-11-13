import { parse } from 'csv-parse/sync';
import type { RefurbishedImportRow } from '@/lib/refurbishedImport';

// The Excel template (docs/refurbished-import-template.csv) as import rows.
// In Excel: File → Save As → "CSV UTF-8" (plain "CSV" garbles the Arabic).
// Cells are passed on as typed; planImport() reports what's wrong with them.

const text = (cell: string | undefined) => cell?.trim() || undefined;
const number = (cell: string | undefined) => {
  const value = text(cell);
  return value === undefined ? undefined : Number(value.replace(',', '.'));
};

export function parseImportCsv(content: string): RefurbishedImportRow[] {
  const records: Record<string, string>[] = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map(
    cells =>
      ({
        sku: cells.sku ?? '',
        titleEn: cells.titleEn ?? '',
        titleAr: cells.titleAr ?? '',
        category: cells.category ?? '',
        type: cells.type ?? '',
        brand: cells.brand ?? '',
        model: text(cells.model),
        grade: cells.grade,
        warrantyMonths: number(cells.warrantyMonths),
        priceJod: number(cells.priceJod),
        imageUrls: (cells.imageUrls ?? '').split('|').map(url => url.trim()).filter(Boolean),
        locationId: cells.locationId ?? '',
        description: cells.description ?? '',
        // An old sheet's filled-in auction columns are passed on, so the row is
        // refused (refurbished items are fixed price) instead of sold at its opening bid.
        ...(text(cells.auctionEndsAt) && { auctionEndsAt: text(cells.auctionEndsAt) }),
        ...(text(cells.auctionIncrementJod) && {
          auctionIncrementJod: number(cells.auctionIncrementJod),
        }),
      }) as RefurbishedImportRow,
  );
}
