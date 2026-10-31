// Support tools and account deletion (BACKEND_PLAN B7.7): an admin refunds a
// paid order (money back, listing on sale again) or unlocks a PIN; DELETE /me
// refuses while money is held for the user as buyer or seller.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { adminToken } from '../admin/testing';
import { hashPassword } from '../auth/password';
import { fakePayments } from '../payments/fake';

let base = '';
const server = app.listen(0);
const EMAILS = ['refund.seller@example.com', 'refund.buyer@example.com', 'refund.admin@example.com'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, admin] = [0, 1, 2].map(i => () => people[i]);
const LISTINGS = ['refund-sofa', 'refund-table'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const delivery = { name: 'Huda', phone: '0791112223', cityId: 'zarqa', address: 'Army St, building 9' };
const paidOrder = async (listingId: string) => {
  const order = (await call('POST', '/orders', buyer(), { listingId, delivery })).body;
  return (await call('POST', `/orders/${order.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const email of EMAILS) {
    await prisma.user.create({ data: { name: email.split('@')[0], email, passwordHash, ...(email.startsWith('refund.admin') && { role: 'admin' }) } });
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token: email.startsWith('refund.admin') ? await adminToken(user.id) : token });
  }
  await prisma.listing.createMany({
    data: LISTINGS.map(id => ({
      id, category: 'furniture', type: 'sofas', titleAr: 'كنبة', titleEn: id, priceFils: 90_000,
      imageUrls: ['https://images.example.com/sofa.jpg'], condition: 'good' as const, locationId: 'zarqa',
      description: 'A corner sofa with washable covers, no tears or stains, easy to take apart.',
      sellerUserId: people[0].id,
    })),
  });
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('no account deletion while money is held, for the buyer or the seller', async () => {
  await paidOrder(LISTINGS[0]);
  for (const who of [buyer(), seller()]) {
    const r = await call('DELETE', '/me', who);
    assert.deepEqual([r.status, r.body.error.code], [409, 'OPEN_ORDERS']);
  }
});

test('an admin refunds: money back, the listing on sale again; only paid, undelivered orders', async () => {
  const order = await prisma.order.findFirstOrThrow({ where: { listingId: LISTINGS[0] } });
  assert.equal((await call('POST', `/admin/orders/${order.id}/refund`, buyer())).status, 403);

  const r = await call('POST', `/admin/orders/${order.id}/refund`, admin());
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'refunded');
  assert.equal(r.body.pin, undefined);
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: LISTINGS[0] } })).status, 'active');
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(payment.status, 'refunded');
  assert.ok(fakePayments.isRefunded(payment.providerRef));
  assert.equal((await call('GET', `/orders/${order.id}`, buyer())).body.status, 'refunded');

  assert.equal((await call('POST', `/admin/orders/${order.id}/refund`, admin())).status, 422); // already
  assert.equal((await call('POST', '/admin/orders/SA-000000/refund', admin())).status, 404);
});

test('an admin unlocks a PIN after 5 wrong tries', async () => {
  const order = await paidOrder(LISTINGS[1]);
  await prisma.order.update({ where: { id: order.id }, data: { pinAttempts: 5 } });
  const r = await call('POST', `/admin/orders/${order.id}/unlock-pin`, admin());
  assert.equal(r.status, 200);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).pinAttempts, 0);
  // Delivered: no refund any more (the money went to the seller).
  await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
  assert.equal((await call('POST', `/admin/orders/${order.id}/refund`, admin())).status, 422);
});

test('with nothing open, the account goes; finished orders stay without the buyer', async () => {
  await call('POST', '/orders', buyer(), { listingId: LISTINGS[0], delivery }); // an unpaid checkout
  assert.equal((await call('DELETE', '/me', buyer())).status, 204);
  const left = await prisma.order.findMany({ where: { listingId: { in: LISTINGS } } });
  assert.ok(left.every(o => o.status !== 'awaiting_payment' && o.buyerId === null));
  assert.equal(left.length, 2);
});
