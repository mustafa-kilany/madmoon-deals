// The Analytics page's numbers (BACKEND_PLAN B8.8): a sign-up, a listing, a paid
// order and a report today show up in today's row, the period's totals and the
// breakdowns.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';
import { adminToken } from './testing';

let base = '';
const server = app.listen(0);
const EMAILS = ['stats.seller@example.com', 'stats.buyer@example.com', 'e2e.stats.admin@sahla.jo'];
const LISTING = 'analytics-lamp';
let admin = '';
let buyer = '';

const call = async (path: string, token = admin, init: RequestInit = {}) => {
  const r = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const analytics = async (days = 7) => (await call(`/admin/analytics?days=${days}`)).body;

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const a = await prisma.user.create({ data: { name: 'Stats Admin', email: EMAILS[2]!, role: 'admin' } });
  admin = await adminToken(a.id);
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: LISTING } });
  await prisma.report.deleteMany({ where: { targetId: LISTING } });
  await prisma.listing.deleteMany({ where: { id: LISTING } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('today’s activity lands in today’s row, the totals and the breakdowns', async () => {
  const before = await analytics();
  assert.equal(before.daily.length, 7);
  assert.equal(before.daily.at(-1).day, before.to);
  assert.equal(before.daily[0].day, before.from);

  const passwordHash = await hashPassword('longenough');
  const seller = await prisma.user.create({ data: { name: 'Seller', email: EMAILS[0]!, passwordHash, method: 'google' } });
  await prisma.user.create({ data: { name: 'Buyer', email: EMAILS[1]!, passwordHash } });
  buyer = (await (await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAILS[1], password: 'longenough' }),
  })).json()).token;
  await prisma.listing.create({
    data: {
      id: LISTING, category: 'furniture', type: 'lighting', titleAr: 'مصباح', titleEn: 'Lamp', priceFils: 20_000,
      imageUrls: ['https://images.example.com/lamp.jpg'], condition: 'good', locationId: 'amman-khalda',
      description: 'A brass floor lamp with a linen shade, works perfectly, a few small marks on the base.',
      sellerUserId: seller.id,
    },
  });
  const order = (await call('/orders', buyer, {
    method: 'POST',
    body: JSON.stringify({ listingId: LISTING, delivery: { name: 'Omar Haddad', phone: '0791234567', cityId: 'amman', address: 'Rainbow St 12' } }),
  })).body;
  assert.equal((await call(`/orders/${order.id}/pay`, buyer, { method: 'POST', body: JSON.stringify({ cardToken: 'mock_visa_4242' }) })).status, 200);
  await prisma.report.create({ data: { reporterId: seller.id, targetType: 'user', targetId: seller.id, reason: 'other' } });

  const now = await analytics();
  const [t0, t1] = [before.daily.at(-1), now.daily.at(-1)];
  assert.equal(t1.signups - t0.signups, 2);
  assert.equal(t1.listings - t0.listings, 1);
  assert.equal(t1.paidOrders - t0.paidOrders, 1);
  assert.equal(t1.salesFils - t0.salesFils, order.totalFils);
  assert.equal(t1.reports - t0.reports, 1);
  assert.equal(now.totals.signups - before.totals.signups, 2);
  assert.equal(now.totals.salesFils - before.totals.salesFils, order.totalFils);
  assert.deepEqual(now.previous, before.previous); // today isn't in the period before
  assert.equal(now.ordersByStatus.escrow_held - before.ordersByStatus.escrow_held, 1);
  assert.equal(now.customersBySignIn.google - before.customersBySignIn.google, 1);
  // The listing is paid for (reserved), so it isn't "on sale" any more.
  const furniture = (r: { listingsByCategory: { category: string; count: number }[] }) =>
    r.listingsByCategory.find(c => c.category === 'furniture')?.count ?? 0;
  assert.equal(furniture(now), furniture(before));
});

test('only 7, 30 or 90 days; admins only', async () => {
  assert.equal((await analytics(30)).daily.length, 30);
  assert.equal((await analytics(90)).daily.length, 90);
  assert.equal((await call('/admin/analytics?days=5')).status, 422);
  assert.equal((await call('/admin/analytics', buyer)).status, 403);
});
