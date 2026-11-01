// Certified Refurbished in the dashboard (BACKEND_PLAN B8.4): stores, their API
// keys, uploading a store's sheet with a preview, and the import history. Also
// enabling a courier again (B14.1).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';
import { adminToken } from './testing';

let base = '';
const server = app.listen(0);
const STORE = 'store-e2e-dashboard';
const ADMIN_EMAIL = 'e2e.stores.admin@sahla.jo';
const COURIER_EMAIL = 'e2e.stores.rider@sahla.jo';
const BUYER_EMAIL = 'stores.buyer@example.com';
let admin = { id: '', token: '' };
// The template sheet: two good rows (an iPhone and a PS5).
const template = readFileSync(new URL('../../../../docs/refurbished-import-template.csv', import.meta.url), 'utf8');

const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const onSale = () => prisma.listing.count({ where: { storeId: STORE, status: 'active' } });

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const user = await prisma.user.create({ data: { name: 'Sara Admin', email: ADMIN_EMAIL, role: 'admin' } });
  admin = { id: user.id, token: await adminToken(user.id) };
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { storeId: STORE } });
  await prisma.listing.deleteMany({ where: { storeId: STORE } });
  await prisma.store.deleteMany({ where: { id: STORE } });
  await prisma.adminAction.deleteMany({ where: { adminId: admin.id } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, COURIER_EMAIL, BUYER_EMAIL] } } });
  await prisma.$disconnect();
});

test('stores: create one, not twice, and only with a store-… id', async () => {
  const bad = await call('POST', '/admin/refurbished/stores', admin.token, { id: 'Apple', nameEn: 'Apple', nameAr: 'آبل' });
  assert.equal(bad.status, 422);
  const created = await call('POST', '/admin/refurbished/stores', admin.token, { id: STORE, nameEn: 'Dashboard Phones', nameAr: 'هواتف اللوحة' });
  assert.equal(created.status, 201);
  assert.equal(created.body.onSale, 0);
  assert.deepEqual(created.body.keys, []);
  assert.equal((await call('POST', '/admin/refurbished/stores', admin.token, { id: STORE, nameEn: 'Again', nameAr: 'مرة أخرى' })).status, 422);
  const stores = (await call('GET', '/admin/refurbished/stores', admin.token)).body;
  assert.ok(stores.some((s: { id: string }) => s.id === STORE));
});

test('the sheet: a preview saves nothing, then it publishes; history says who', async () => {
  const preview = await call('POST', `/admin/refurbished/stores/${STORE}/import`, admin.token, { csv: template, dryRun: true });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body, { dryRun: true, created: 2, updated: 0, withdrawn: 0, errors: [], rows: 2 });
  assert.equal(await onSale(), 0);

  // A broken row is reported with its sku and skipped; the good one is imported.
  const broken = template.replace(',365,', ',-5,');
  const done = await call('POST', `/admin/refurbished/stores/${STORE}/import`, admin.token, { csv: broken });
  assert.equal(done.status, 200);
  assert.equal(done.body.created, 1);
  assert.deepEqual(done.body.errors.map((e: { row: number; sku: string; field: string }) => [e.row, e.sku, e.field]), [[1, 'iphone-13-128', 'priceJod']]);
  assert.equal(await onSale(), 1);

  const history = (await call('GET', `/admin/refurbished/stores/${STORE}/imports`, admin.token)).body;
  assert.equal(history.length, 1); // the preview isn't history
  assert.equal(history[0].source, 'Admin: Sara Admin');
  assert.equal(history[0].created, 1);
  assert.equal(history[0].errors.length, 1);
  const audit = (await call('GET', `/admin/actions?targetType=store&targetId=${STORE}`, admin.token)).body;
  assert.equal(audit[0].action, 'store.import');
  assert.deepEqual(audit[0].details, { mode: 'upsert', dryRun: false, created: 1, updated: 0, withdrawn: 0, skippedRows: 1 });
});

test('the sheet: not CSV, the wrong columns, or empty → a clear error', async () => {
  const notCsv = await call('POST', `/admin/refurbished/stores/${STORE}/import`, admin.token, { csv: 'sku,titleEn\n"unclosed,quote' });
  assert.equal(notCsv.status, 422);
  assert.match(notCsv.body.error.message, /CSV UTF-8/);
  const wrong = await call('POST', `/admin/refurbished/stores/${STORE}/import`, admin.token, { csv: 'name,price\nPhone,100\n' });
  assert.equal(wrong.status, 422);
  assert.match(wrong.body.error.message, /header/);
  const empty = await call('POST', `/admin/refurbished/stores/${STORE}/import`, admin.token, { csv: template.split('\n')[0] });
  assert.equal(empty.status, 422);
  assert.equal((await call('POST', '/admin/refurbished/stores/store-nobody/import', admin.token, { csv: template })).status, 404);
});

test('keys: shown once, work for the brand’s system, and stop when revoked', async () => {
  const made = await call('POST', `/admin/refurbished/stores/${STORE}/keys`, admin.token, { label: 'Stock system' });
  assert.equal(made.status, 201);
  assert.match(made.body.key, /^sahla_sk_/);
  const stores = (await call('GET', '/admin/refurbished/stores', admin.token)).body;
  const listed = stores.find((s: { id: string }) => s.id === STORE).keys[0];
  assert.equal(listed.label, 'Stock system');
  assert.equal('key' in listed, false); // never again

  const items = [{
    sku: 'ps5-disc', titleEn: 'PlayStation 5', titleAr: 'بلايستيشن 5', category: 'electronics', type: 'gaming', brand: 'Sony',
    grade: 'excellent', warrantyMonths: 6, priceJod: 250, imageUrls: ['https://cdn.example.com/ps5.jpg'], locationId: 'amman-abdali',
    description: 'Tested on games, disc drive, Wi-Fi and every port. Includes one controller and all the cables.',
  }];
  const byKey = await call('POST', '/admin/refurbished/import', made.body.key, { storeId: STORE, items });
  assert.equal(byKey.status, 200);
  assert.equal(byKey.body.updated, 1);
  assert.equal((await call('GET', `/admin/refurbished/stores/${STORE}/imports`, admin.token)).body[0].source, 'Key: Stock system');

  assert.equal((await call('POST', `/admin/refurbished/stores/${STORE}/keys/${made.body.id}/revoke`, admin.token)).status, 200);
  assert.equal((await call('POST', `/admin/refurbished/stores/${STORE}/keys/${made.body.id}/revoke`, admin.token)).status, 422);
  assert.equal((await call('POST', '/admin/refurbished/import', made.body.key, { storeId: STORE, items })).status, 401);
  assert.equal((await call('POST', `/admin/refurbished/stores/store-other/keys/${made.body.id}/revoke`, admin.token)).status, 404);
});

test('couriers: a disabled courier can be enabled again', async () => {
  const courier = await prisma.user.create({ data: { name: 'Rider', email: COURIER_EMAIL, role: 'courier', suspended: true } });
  assert.equal((await call('POST', `/admin/couriers/${courier.id}/enable`, admin.token)).status, 204);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: courier.id } })).suspended, false);
  assert.equal((await call('POST', `/admin/couriers/${courier.id}/enable`, admin.token)).status, 422);
  assert.equal((await call('POST', `/admin/couriers/${admin.id}/enable`, admin.token)).status, 404);
});

test('the store’s pickup: set once in the dashboard, copied onto each order for the courier', async () => {
  const bad = await call('POST', `/admin/refurbished/stores/${STORE}/pickup`, admin.token, { phone: '123', cityId: 'amman-abdali', address: 'Abdali Blvd, tower 2' });
  assert.equal(bad.status, 422);
  const set = await call('POST', `/admin/refurbished/stores/${STORE}/pickup`, admin.token, {
    phone: '+962 79 000 1111', cityId: 'amman-abdali', address: 'Abdali Blvd, tower 2, ground floor',
  });
  assert.deepEqual(set.body, { phone: '0790001111', cityId: 'amman-abdali', address: 'Abdali Blvd, tower 2, ground floor' });
  const store = (await call('GET', '/admin/refurbished/stores', admin.token)).body.find((s: { id: string }) => s.id === STORE);
  assert.deepEqual(store.pickup, set.body);

  await prisma.user.create({ data: { name: 'Store Buyer', email: BUYER_EMAIL, passwordHash: await hashPassword('longenough') } });
  const buyer = (await call('POST', '/auth/login', undefined, { email: BUYER_EMAIL, password: 'longenough' })).body.token;
  const listing = await prisma.listing.findFirstOrThrow({ where: { storeId: STORE, status: 'active' } });
  const order = await call('POST', '/orders', buyer, {
    listingId: listing.id,
    delivery: { name: 'Omar Haddad', phone: '0791234567', cityId: 'amman', address: 'Rainbow St, building 12' },
  });
  assert.equal(order.status, 201);
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.body.id } });
  assert.deepEqual(
    [saved.pickupName, saved.pickupPhone, saved.pickupCityId, saved.pickupAddress],
    ['Dashboard Phones', '0790001111', 'amman-abdali', 'Abdali Blvd, tower 2, ground floor'],
  );
});
