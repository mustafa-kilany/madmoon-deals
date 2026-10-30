// GET /listings/:id, POST /listings/:id/views, GET /me/listings.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';

let base = '';
let token = '';
const server = app.listen(0);
const sellerId = 'user-e2e-seller';
const listing = (id: string, status: 'active' | 'sold' | 'withdrawn', minutesAgo: number) => ({
  id,
  category: 'furniture',
  type: 'sofas',
  titleAr: 'كنبة',
  titleEn: 'Sofa',
  priceFils: 150_000,
  imageUrls: ['https://images.example.com/sofa.jpg'],
  condition: 'good' as const,
  description: 'A comfortable three seat sofa in good condition, no stains, from a smoke free home.',
  status,
  locationId: 'amman-khalda',
  sellerUserId: sellerId,
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
});

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  await prisma.user.create({
    data: { id: sellerId, name: 'Rana', email: 'rana.e2e@sahla.jo', passwordHash: await hashPassword('sahla1234') },
  });
  await prisma.listing.createMany({
    data: [listing('e2e-old', 'sold', 30), listing('e2e-new', 'active', 5), listing('e2e-gone', 'withdrawn', 1)],
  });
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rana.e2e@sahla.jo', password: 'sahla1234' }),
  });
  token = (await login.json()).token;
});
// Leave the shared test database as found: other files count listings.
after(async () => {
  server.close();
  await prisma.listing.deleteMany({ where: { sellerUserId: sellerId } });
  await prisma.user.delete({ where: { id: sellerId } });
  await prisma.$disconnect();
});

test('GET /listings/:id: active and sold listings open; deleted and unknown are 404', async () => {
  const item = await (await fetch(`${base}/listings/e2e-new`)).json();
  assert.equal(item.id, 'e2e-new');
  assert.deepEqual(item.seller, { ar: 'Rana', en: 'Rana' });
  assert.equal(item.sellerId, sellerId);
  assert.equal((await (await fetch(`${base}/listings/e2e-old`)).json()).status, 'sold');
  for (const id of ['e2e-gone', 'nope']) {
    const r = await fetch(`${base}/listings/${id}`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error.code, 'NOT_FOUND');
  }
});

test('POST /listings/:id/views counts each viewer once a day', async () => {
  const view = (headers: Record<string, string> = {}) =>
    fetch(`${base}/listings/e2e-new/views`, { method: 'POST', headers });
  const views = async () =>
    (await prisma.listing.findUniqueOrThrow({ where: { id: 'e2e-new' } })).views;

  const start = await views();
  assert.equal((await view({ 'X-Device-Id': 'phone-a' })).status, 204);
  await view({ 'X-Device-Id': 'phone-a' }); // same phone, same day
  await view({ 'X-Device-Id': 'phone-b' });
  await view({ Authorization: `Bearer ${token}` });
  await view({ Authorization: `Bearer ${token}`, 'X-Device-Id': 'phone-c' }); // same user
  assert.equal(await views(), start + 3);
  assert.equal((await fetch(`${base}/listings/nope/views`, { method: 'POST' })).status, 404);
});

test('GET /me/listings: the seller’s listings, newest first, without deleted ones', async () => {
  const r = await fetch(`${base}/me/listings`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual(
    (await r.json()).map((i: { id: string }) => i.id),
    ['e2e-new', 'e2e-old'],
  );
  assert.equal((await fetch(`${base}/me/listings`)).status, 401);
});
