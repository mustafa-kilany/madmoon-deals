// Selling (BACKEND_PLAN B4.1, B4.2): publish with our own uploaded photos, then
// change the price / condition or withdraw. Every rule in docs/API.md → POST /listings.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { app } from '../../app';
import { prisma } from '../../db';
import { fakeOcr } from '../certificates/fakeOcr';
import { useOcrForTests } from '../certificates/service';

let base = '';
const server = app.listen(0);
const EMAILS = ['seller.one@example.com', 'seller.two@example.com'];
const tokens: string[] = [];

const call = async (method: string, path: string, body?: unknown, token = tokens[0]) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};

const photo = async (token = tokens[0]) => {
  const data = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#ffffff', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await fetch(`${base}/uploads/listing-photo`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
  return (await r.json()).url as string;
};

const DESCRIPTION = 'Solid oak dining table with six chairs, a few light scratches on the top, very sturdy.';
const sofa = async (extra: Record<string, unknown> = {}) => ({
  category: 'furniture',
  type: 'tables',
  titleAr: 'طاولة سفرة',
  titleEn: 'Dining table',
  priceFils: 120_000,
  imageUrls: [await photo(), await photo()],
  condition: 'good',
  description: DESCRIPTION,
  locationId: 'amman-khalda',
  saleType: 'fixed',
  pickup: PICKUP,
  ...extra,
});

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rami', email, password: 'longenough', code: '123456' }),
    });
    tokens.push((await r.json()).token);
  }
});
after(async () => {
  server.close();
  useOcrForTests(null);
  const users = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
  await prisma.listing.deleteMany({ where: { sellerUserId: { in: users.map(u => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

const PICKUP = { phone: '+962 79 123 4567', address: 'Wasfi Al-Tal St, building 40', notes: 'Ring twice' };

test('publish: an active Item from the caller, findable in search; the photos are marked used', async () => {
  const input = await sofa();
  const r = await call('POST', '/listings', input);
  assert.equal(r.status, 201);
  const item = r.body;
  const me = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[0] } });
  assert.deepEqual(
    [item.status, item.sellerId, item.seller.en, item.saleType, item.verified, item.views, item.description],
    ['active', me.id, 'Rami', 'fixed', false, 0, DESCRIPTION],
  );
  assert.deepEqual(item.imageUrls, input.imageUrls);
  assert.equal(item.imageUrl, input.imageUrls[0].replace(/\.jpg$/, '_400.jpg')); // the thumbnail
  assert.equal(item.location.id, 'amman-khalda');
  // The pickup is kept for the courier, never shown on the listing.
  const saved = await prisma.listing.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([saved.pickupPhone, saved.pickupAddress, saved.pickupNotes], ['0791234567', PICKUP.address, 'Ring twice']);
  assert.ok(!JSON.stringify(item).includes('0791234567') && !JSON.stringify(item).includes('Wasfi'));
  const page = await (await fetch(`${base}/listings/${item.id}`)).json();
  assert.ok(!JSON.stringify(page).includes('0791234567') && !JSON.stringify(page).includes('Wasfi'));

  const search = await (await fetch(`${base}/listings?q=${encodeURIComponent('طاوله')}&category=furniture`)).json();
  assert.ok(search.items.some((i: { id: string }) => i.id === item.id), 'found by its Arabic title, folded');
  const used = await prisma.upload.findMany({ where: { url: { in: input.imageUrls.map((u: string) => new URL(u).pathname) } } });
  assert.ok(used.every(u => u.usedAt));

  // The same photos can't go on a second listing.
  const again = await call('POST', '/listings', { ...input, titleEn: 'Another table' });
  assert.deepEqual([again.status, again.body.error.code], [422, 'VALIDATION']);
});

test('auction: starting bid, end time and increment', async () => {
  const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const r = await call('POST', '/listings', await sofa({ saleType: 'auction', auctionEndsAt: endsAt, incrementFils: 2000 }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.auction, { endsAt, bidCount: 0, incrementFils: 2000 });
  const fixed = await call('POST', '/listings', await sofa({ incrementFils: 2000 }));
  assert.equal(fixed.body.auction, undefined);
});

test('every rule in docs/API.md is a 422 VALIDATION', async () => {
  const hour = 3_600_000;
  const bad: [string, Record<string, unknown>][] = [
    ['refurbished grade', { condition: 'refurbished_like_new' }],
    ['9-word description', { description: 'one two three four five six seven eight nine' }],
    ['punctuation only', { description: '- - - - - - - - - - - -' }],
    ['unknown category', { category: 'pets' }],
    ['type of another category', { type: 'phones' }],
    ['unknown area', { locationId: 'paris' }],
    ['no photos', { imageUrls: [] }],
    ['6 photos', { imageUrls: Array(6).fill('http://x.test/files/listings/a.jpg') }],
    ['a photo from elsewhere', { imageUrls: ['https://images.example.com/sofa.jpg'] }],
    ['zero price', { priceFils: 0 }],
    ['fractional fils', { priceFils: 10.5 }],
    ['auction without an end', { saleType: 'auction' }],
    ['auction ending in 30 minutes', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + hour / 2).toISOString() }],
    ['auction of 30 days', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 720 * hour).toISOString() }],
    ['no pickup', { pickup: undefined }],
    ['pickup phone not Jordanian', { pickup: { ...PICKUP, phone: '+44 20 7946 0000' } }],
    ['pickup without an address', { pickup: { phone: PICKUP.phone, address: '' } }],
  ];
  for (const [name, change] of bad) {
    const r = await call('POST', '/listings', { ...(await sofa()), ...change });
    assert.deepEqual([r.status, r.body.error?.code], [422, 'VALIDATION'], name);
  }
  // Someone else's upload isn't yours to publish.
  const theirs = await call('POST', '/listings', { ...(await sofa()), imageUrls: [await photo(tokens[1])] });
  assert.deepEqual([theirs.status, theirs.body.error.code], [422, 'VALIDATION']);
  // Signed out
  assert.equal((await call('POST', '/listings', await sofa(), 'nope')).status, 401);
});

test('PATCH: price and condition, only by the seller', async () => {
  const { body: item } = await call('POST', '/listings', await sofa());
  const r = await call('PATCH', `/listings/${item.id}`, { priceFils: 99_000, condition: 'excellent' });
  assert.deepEqual([r.status, r.body.priceFils, r.body.condition], [200, 99_000, 'excellent']);
  assert.equal((await call('PATCH', `/listings/${item.id}`, { priceFils: 1 }, tokens[1])).status, 403);
  assert.equal((await call('PATCH', `/listings/${item.id}`, { condition: 'refurbished_good' })).status, 422);
  assert.equal((await call('PATCH', `/listings/${item.id}`, { titleEn: 'New title' })).status, 422);
  assert.equal((await call('PATCH', `/listings/${item.id}`, {})).status, 422);

  // A new pickup (moved house): for orders from now on.
  const moved = await call('PATCH', `/listings/${item.id}`, { pickup: { phone: '0781112223', address: 'Mecca St, building 7' } });
  assert.equal(moved.status, 200);
  const saved = await prisma.listing.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([saved.pickupPhone, saved.pickupAddress, saved.pickupNotes], ['0781112223', 'Mecca St, building 7', null]);
  assert.equal((await call('PATCH', `/listings/${item.id}`, { pickup: { phone: '123', address: 'Mecca St, building 7' } })).status, 422);
});

test('an auction with bids keeps its price and can’t be withdrawn', async () => {
  const endsAt = new Date(Date.now() + 86_400_000).toISOString();
  const { body: item } = await call('POST', '/listings', await sofa({ saleType: 'auction', auctionEndsAt: endsAt }));
  await prisma.listing.update({ where: { id: item.id }, data: { bidCount: 1 } }); // bids come in B6
  assert.equal((await call('PATCH', `/listings/${item.id}`, { priceFils: 1000 })).status, 422);
  assert.equal((await call('PATCH', `/listings/${item.id}`, { condition: 'excellent' })).status, 200);
  assert.equal((await call('DELETE', `/listings/${item.id}`)).status, 422);
});

test('DELETE withdraws: gone from search, the page and My listings; not once paid for', async () => {
  const { body: item } = await call('POST', '/listings', await sofa());
  assert.equal((await call('DELETE', `/listings/${item.id}`, undefined, tokens[1])).status, 403);
  assert.equal((await call('DELETE', `/listings/${item.id}`)).status, 204);
  assert.equal((await fetch(`${base}/listings/${item.id}`)).status, 404);
  assert.ok(!(await call('GET', '/me/listings')).body.some((i: { id: string }) => i.id === item.id));
  assert.equal((await call('DELETE', `/listings/${item.id}`)).status, 404);

  const { body: paid } = await call('POST', '/listings', await sofa());
  await prisma.listing.update({ where: { id: paid.id }, data: { status: 'reserved' } });
  const refused = await call('DELETE', `/listings/${paid.id}`);
  assert.deepEqual([refused.status, refused.body.error.code], [409, 'OPEN_ORDERS']);
});

// B4.5: phones and electronics need a passed shop test certificate for the same device.
const IPHONE = { category: 'mobiles', type: 'phones', brand: 'Apple', model: 'iPhone 14 Pro' };
let paperSeed = 0;
const certificate = async (device: Record<string, string> = IPHONE, token = tokens[0]) => {
  useOcrForTests(fakeOcr);
  const paper = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#fff', noise: { type: 'gaussian', mean: 100 + paperSeed++, sigma: 50 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  for (const [key, value] of Object.entries(device)) form.append(key, value);
  form.append('photo', new Blob([new Uint8Array(paper)], { type: 'image/jpeg' }), 'report.jpg');
  const r = await fetch(`${base}/test-certificates`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
  return (await r.json()) as { id: string; status: string };
};
const phone = async (extra: Record<string, unknown> = {}) => ({
  ...(await sofa()),
  ...IPHONE,
  titleAr: 'ايفون 14 برو',
  titleEn: 'iPhone 14 Pro',
  priceFils: 520_000,
  ...extra,
});

test('a phone needs a passed certificate for the same device; buyers see its blurred copy', async () => {
  const none = await call('POST', '/listings', await phone());
  assert.deepEqual([none.status, none.body.error.code], [422, 'VALIDATION']);

  const cert = await certificate();
  assert.equal(cert.status, 'passed');
  const r = await call('POST', '/listings', await phone({ testCertificateId: cert.id }));
  assert.equal(r.status, 201);
  assert.match(r.body.testCertificate.imageUrl, /\/files\/certificates\/.+_blurred\.jpg$/);
  assert.match(r.body.testCertificate.shopName, /Sahla|سهلة/);
  assert.deepEqual(r.body.testCertificate.specs, ['128GB', 'Battery 91%']);
  const page = await (await fetch(`${base}/listings/${r.body.id}`)).json();
  assert.equal(page.testCertificate.imageUrl, r.body.testCertificate.imageUrl);

  // Used up: not on a second listing.
  const again = await call('POST', '/listings', await phone({ testCertificateId: cert.id }));
  assert.deepEqual([again.status, again.body.error.code], [422, 'VALIDATION']);
});

test('the certificate must be the seller’s, passed, and for this type, brand and model', async () => {
  const theirs = await certificate(IPHONE, tokens[1]);
  const otherModel = await certificate({ ...IPHONE, model: 'iPhone 13' });
  const tablet = await certificate({ ...IPHONE, type: 'tablets', model: 'iPad Air' });
  const failed = await certificate();
  await prisma.testCertificate.update({ where: { id: failed.id }, data: { status: 'failed', problems: ['no_specs'] } });
  for (const [name, id] of [['someone else’s', theirs.id], ['another model', otherModel.id], ['another type', tablet.id], ['failed', failed.id], ['made up', 'nope']]) {
    const r = await call('POST', '/listings', await phone({ testCertificateId: id }));
    assert.deepEqual([r.status, r.body.error?.code], [422, 'VALIDATION'], name);
  }
  // Types without certificates ignore the field.
  assert.equal((await call('POST', '/listings', await sofa({ testCertificateId: 'nope' }))).status, 201);
});
