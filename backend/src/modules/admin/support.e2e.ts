// The dashboard's support pages (BACKEND_PLAN B8.5): find orders, mark payouts
// sent, look up users, suspend and unsuspend (a suspended seller's listings
// come off sale and they are signed out).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { dataSeal } from '../../lib/sealed';
import { hashPassword } from '../auth/password';
import { adminToken } from './testing';

let base = '';
const server = app.listen(0);
const EMAILS = ['support.seller@example.com', 'support.buyer@example.com', 'e2e.support.admin@sahla.jo', 'e2e.support.rider@sahla.jo'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, admin, courier] = [0, 1, 2, 3].map(i => () => people[i]);
const LISTINGS = ['support-desk', 'support-shelf'];
const delivery = { name: 'Omar Haddad', phone: '0791234567', cityId: 'amman', address: 'Rainbow St, building 12' };

const call = async (method: string, path: string, who?: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(who && { Authorization: `Bearer ${who.token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const paidOrder = async (listingId: string) => {
  const order = (await call('POST', '/orders', buyer(), { listingId, delivery })).body;
  return (await call('POST', `/orders/${order.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
};
const logIn = async (email: string) =>
  call('POST', '/auth/login', undefined, { email, password: 'longenough' });

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const email of EMAILS) {
    const role = email.includes('admin') ? 'admin' : email.endsWith('@sahla.jo') ? 'courier' : undefined;
    const user = await prisma.user.create({ data: { name: email.split('@')[0], email, passwordHash, ...(role && { role }), ...(role === 'admin' && { adminRole: 'owner' as const }) } });
    people.push({ id: user.id, token: role === 'admin' ? await adminToken(user.id) : (await logIn(email)).body.token });
  }
  await prisma.listing.createMany({
    data: LISTINGS.map(id => ({
      id, category: 'furniture', type: 'desks', titleAr: 'مكتب', titleEn: id, priceFils: 50_000,
      imageUrls: ['https://images.example.com/desk.jpg'], condition: 'good' as const, locationId: 'amman',
      description: 'A solid oak desk with two drawers, a few light scratches on the top, very sturdy.',
      sellerUserId: people[0].id,
    })),
  });
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.adminAction.deleteMany({ where: { adminId: people[2]?.id } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('orders: find by number, email or status; the whole order but never the PIN', async () => {
  const paid = await paidOrder(LISTINGS[0]);
  assert.equal((await call('GET', '/admin/orders', buyer())).status, 403); // an app token

  const byId = (await call('GET', `/admin/orders?q=${paid.id.toLowerCase()}`, admin())).body;
  assert.deepEqual(byId.map((o: { id: string }) => o.id), [paid.id]);
  const byEmail = (await call('GET', '/admin/orders?q=support.buyer', admin())).body;
  assert.ok(byEmail.some((o: { id: string }) => o.id === paid.id));
  assert.equal(byEmail[0].buyer.email, EMAILS[1]);
  const waiting = (await call('GET', '/admin/orders?unassigned=true', admin())).body;
  assert.ok(waiting.some((o: { id: string }) => o.id === paid.id));
  assert.equal((await call('GET', '/admin/orders?status=refunded&q=support.buyer', admin())).body.length, 0);

  const detail = await call('GET', `/admin/orders/${paid.id}`, admin());
  assert.equal(detail.status, 200);
  assert.equal(detail.body.delivery.phone, '0791234567');
  assert.equal(detail.body.seller.email, EMAILS[0]);
  assert.deepEqual(detail.body.payments.map((p: { status: string }) => p.status), ['succeeded']);
  assert.equal(detail.body.pinLocked, false);
  assert.equal(JSON.stringify(detail.body).includes(`"${paid.pin}"`), false);
  assert.equal(detail.body.pin, undefined);
  assert.equal((await call('GET', '/admin/orders/SA-000000', admin())).status, 404);
});

test('payouts: delivered orders wait to be paid; marking one paid is logged on the order', async () => {
  const [order] = (await call('GET', '/admin/orders?q=support.buyer&status=escrow_held', admin())).body;
  const { pin } = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  await prisma.order.update({ where: { id: order.id }, data: { courierId: courier().id, courierStatus: 'picked_up' } });
  assert.equal((await call('POST', '/courier/confirm-delivery', courier(), { orderId: order.id, pin })).status, 200);

  // S3.7: the seller's bank account, needed before it can be marked sent (payouts.e2e.ts has the rules).
  await prisma.user.update({ where: { email: EMAILS[0] }, data: { payoutHolder: 'Test Seller', payoutIban: dataSeal('JO94CBJO0010000000000131000302'), payoutIbanLast4: '0302' } });
  const pending = (await call('GET', '/admin/payouts', admin())).body;
  const payout = pending.find((p: { orderId: string }) => p.orderId === order.id);
  assert.deepEqual([payout.amountFils, payout.status, payout.seller.email], [50_000, 'pending', EMAILS[0]]);

  assert.equal((await call('POST', `/admin/payouts/${payout.id}/paid`, admin(), {})).status, 422); // the bank reference
  const paid = await call('POST', `/admin/payouts/${payout.id}/paid`, admin(), { reference: 'TRF-2026-0042' });
  assert.deepEqual([paid.status, paid.body.status, typeof paid.body.paidAt], [200, 'paid', 'string']);
  assert.equal((await call('POST', `/admin/payouts/${payout.id}/paid`, admin(), { reference: 'again' })).status, 422);
  assert.ok((await call('GET', '/admin/payouts?status=paid', admin())).body.some((p: { id: string }) => p.id === payout.id));

  const history = (await call('GET', `/admin/actions?targetType=order&targetId=${order.id}`, admin())).body;
  assert.deepEqual(history[0].details, { payoutId: payout.id, amountFils: 50_000, reference: 'TRF-2026-0042', ibanLast4: '0302' });
});

test('users: look up; suspending signs them out and takes their listings off sale; unsuspend brings them back', async () => {
  const found = (await call('GET', '/admin/users?q=SUPPORT.SELLER', admin())).body;
  assert.deepEqual(found.map((u: { email: string }) => u.email), [EMAILS[0]]);
  const detail = (await call('GET', `/admin/users/${seller().id}`, admin())).body;
  assert.deepEqual(detail.listings, { active: 1, sold: 1 });
  assert.equal(detail.counts.sales, 1);
  assert.equal(detail.recentSales.length, 1);

  // A reason is needed; not yourself, not staff.
  assert.equal((await call('POST', `/admin/users/${seller().id}/suspend`, admin(), {})).status, 422);
  assert.equal((await call('POST', `/admin/users/${admin().id}/suspend`, admin(), { reason: 'test' })).status, 422);
  assert.equal((await call('POST', `/admin/users/${courier().id}/suspend`, admin(), { reason: 'test' })).status, 422);

  const onSale = async () =>
    (await call('GET', `/listings?category=furniture&limit=50`)).body.items.some((i: { id: string }) => i.id === LISTINGS[1]);
  assert.equal(await onSale(), true);
  const suspended = await call('POST', `/admin/users/${seller().id}/suspend`, admin(), { reason: 'Selling fake items' });
  assert.deepEqual([suspended.status, suspended.body.suspended], [200, true]);

  assert.equal((await call('GET', '/me', seller())).status, 401); // signed out everywhere
  assert.equal((await logIn(EMAILS[0])).status, 403);
  assert.equal(await onSale(), false);
  const order = await call('POST', '/orders', buyer(), { listingId: LISTINGS[1], delivery });
  assert.deepEqual([order.status, order.body.error.code], [409, 'ITEM_UNAVAILABLE']);
  assert.equal((await call('POST', `/listings/${LISTINGS[1]}/offers`, buyer(), { amountFils: 40_000 })).status, 409);

  assert.equal((await call('POST', `/admin/users/${seller().id}/unsuspend`, admin(), { reason: 'Proved the items are real' })).status, 200);
  assert.equal((await logIn(EMAILS[0])).status, 200);
  assert.equal(await onSale(), true);
  const log = (await call('GET', `/admin/actions?targetType=user&targetId=${seller().id}`, admin())).body;
  assert.deepEqual(log.map((a: { action: string }) => a.action), ['user.unsuspend', 'user.suspend']);
});
