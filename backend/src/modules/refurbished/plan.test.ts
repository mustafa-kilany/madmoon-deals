import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { RefurbishedImportRow } from '@/lib/refurbishedImport';
import { parseImportCsv } from './csv';
import { planImport, toListingFields, type ExistingListing } from './plan';

const row = (sku: string, change: Partial<RefurbishedImportRow> = {}): RefurbishedImportRow => ({
  sku,
  titleEn: 'iPhone 13 128GB',
  titleAr: 'آيفون 13 - 128 جيجا',
  category: 'mobiles',
  type: 'phones',
  brand: 'Apple',
  model: 'iPhone 13',
  grade: 'excellent',
  warrantyMonths: 12,
  priceJod: 365.5,
  imageUrls: ['https://cdn.example.com/a.jpg'],
  locationId: 'amman-abdali',
  description: 'Inspected and certified by Apple, new battery and original box included.',
  ...change,
});

const existing = (sku: string, status: ExistingListing['status'] = 'active', change = {}) =>
  ({ ...toListingFields(row(sku, change)), id: `id-${sku}`, sku, status }) as ExistingListing;

test('a row becomes a refurbished listing: fils, condition, trimmed text', () => {
  const fields = toListingFields(row('a', { titleEn: '  iPhone 13 ' }));
  assert.equal(fields.priceFils, 365_500);
  assert.equal(fields.condition, 'refurbished_excellent');
  assert.equal(fields.titleEn, 'iPhone 13');
  assert.equal(fields.saleType, 'fixed');
});

test('new skus are created, changed ones updated, unchanged ones left alone', () => {
  const plan = planImport(
    [row('new'), row('changed', { priceJod: 300 }), row('same')],
    [existing('changed'), existing('same')],
    'upsert',
  );
  assert.deepEqual(plan.create.map(c => c.sku), ['new']);
  assert.deepEqual(plan.update.map(u => u.sku), ['changed']);
  assert.deepEqual(plan.errors, []);
});

test('bad rows, repeated skus and open orders are reported, not saved', () => {
  const plan = planImport(
    [row('a', { priceJod: 0 }), row('b'), row('b'), row('paid')],
    [existing('paid', 'reserved', { priceJod: 1 })],
    'upsert',
  );
  assert.deepEqual(
    plan.errors.map(e => [e.row, e.field]),
    [[1, 'priceJod'], [3, 'sku'], [4, 'sku']],
  );
  assert.deepEqual(plan.create.map(c => c.sku), ['b']);
});

test('replace mode withdraws the store listings missing from the sheet', () => {
  const plan = planImport(
    [row('kept'), row('broken', { grade: 'mint' as never })],
    [existing('kept'), existing('broken'), existing('gone'), existing('already-sold', 'sold')],
    'replace',
  );
  // "broken" has an error but is still in the sheet, so it stays on sale.
  assert.deepEqual(plan.withdraw.map(w => w.sku), ['gone']);
});

test('the Excel template imports cleanly', () => {
  const rows = parseImportCsv(
    readFileSync(new URL('../../../../docs/refurbished-import-template.csv', import.meta.url), 'utf8'),
  );
  assert.ok(rows.length >= 2);
  assert.deepEqual(rows[0].imageUrls.length, 2); // "a|b" in one cell
  const plan = planImport(rows, [], 'upsert');
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.create.length, rows.length);
  assert.ok(plan.create.every(c => c.fields.saleType === 'fixed'));
});

test('refurbished items are fixed price: an old sheet with auction columns is refused', () => {
  const csv = [
    'sku,titleEn,titleAr,category,type,brand,model,grade,warrantyMonths,priceJod,imageUrls,locationId,description,auctionEndsAt,auctionIncrementJod',
    'ps5,PS5,بلايستيشن 5,electronics,gaming,Sony,,excellent,6,260,https://cdn.example.com/ps5.jpg,amman-abdali,"Tested on games, disc drive, Wi-Fi and every port, with a controller and cables.",2026-12-01T18:00:00Z,10',
    'tv,TV,تلفزيون,electronics,tvs,Sony,,good,6,300,https://cdn.example.com/tv.jpg,amman-abdali,"Tested on every input, the remote and the speakers, with the original stand and cables.",,',
  ].join('\n');
  const plan = planImport(parseImportCsv(csv), [], 'upsert');
  assert.deepEqual(plan.errors.map(e => [e.row, e.field]), [[1, 'auctionEndsAt'], [1, 'auctionIncrementJod']]);
  assert.deepEqual(plan.create.map(c => c.sku), ['tv']); // empty auction cells are fine
});
