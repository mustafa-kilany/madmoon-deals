// When an order doesn't simply arrive (BACKEND_PLAN B15.3–B15.4): the buyer
// cancels before pickup; the driver marks a delivery failed with a reason from
// the list; the buyer reports a problem with the item at the door; an admin
// retries or refunds. Buyer and seller see why; the right people get pushes.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { adminToken } from '../admin/testing';
import { hashPassword } from '../auth/password';
import { fakePushes } from '../notifications/push';
import { fakePayments } from '../payments/fake';

let base = '';
const server = app.listen(0);
const EMAILS = [
  'problem.seller@example.com',
  'problem.buyer@example.com',
  'e2e.problem.admin@sahla.jo',
  'e2e.problem.rider@sahla.jo',
  'e2e.problem.rider2@sahla.jo',
];
const ROLES = [undefined, undefined, 'admin', 'courier', 'courier'] as const;
const people: { id: string; token: string; phone: string }[] = [];
const [seller, buyer, admin, rider, rider2] = [0, 1, 2, 3, 4].map(i => () => people[i]);
const NAMES = ['seller', 'buyer', 'admin', 'rider', 'rider2'];
const LISTINGS = ['problem-a', 'problem-b', 'problem-c', 'problem-d', 'problem-e'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const pushed = async () => {
  await flushJobs();
  return fakePushes.sent.splice(0).map(({ token, message }) => [NAMES[people.findIndex(p => p.phone === token)], message.body]);
};
const delivery = { name: 'Huda', phone: '0791112223', cityId: 'zarqa', address: 'Army St, building 9' };
const paidOrder = async (listingId: string) => {
  const order = (await call('POST', '/orders', buyer(), { listingId, delivery })).body;
  return (await call('POST', `/orders/${order.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
};
const assign = (orderId: string, who = rider()) => call('POST', `/admin/orders/${orderId}/assign`, admin(), { courierId: who.id });
const listingStatus = async (id: string) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).status;
const refunded = async (orderId: string) => {
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  return payment.status === 'refunded' && fakePayments.isRefunded(payment.providerRef);
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const [i, email] of EMAILS.entries()) {
    const user = await prisma.user.create({ data: { name: NAMES[i], email, passwordHash, ...(ROLES[i] && { role: ROLES[i] }), ...(ROLES[i] === 'admin' && { adminRole: 'owner' as const }) } });
    let token: string;
    if (ROLES[i] === 'admin') token = await adminToken(user.id);
    else {
      const r = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'longenough' }),
      });
      token = (await r.json()).token;
    }
    const phone = `fcm-problem-${i}-0123456789abcdefghijklmnop`;
    people.push({ id: user.id, token, phone });
    if (ROLES[i] !== 'admin')
      assert.equal((await call('POST', '/me/devices', people[i], { token: phone, platform: 'android', language: 'en' })).status, 204);
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
beforeEach(async () => {
  await flushJobs();
  fakePushes.sent.length = 0;
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('B15.3 the buyer cancels before pickup: money back, on sale again, seller and driver told', async () => {
  const order = await paidOrder(LISTINGS[0]);
  await assign(order.id);
  await pushed();

  // A reason from the list; "other" needs a note; only the buyer.
  assert.equal((await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'bored' })).status, 422);
  assert.equal((await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'other' })).status, 422);
  assert.equal((await call('POST', `/orders/${order.id}/cancel`, seller(), { reason: 'changed_mind' })).status, 404);

  const r = await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'found_better' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'cancelled');
  assert.equal(r.body.cancel.reason, 'found_better');
  assert.equal(r.body.pin, undefined);
  assert.ok(await refunded(order.id));
  assert.equal(await listingStatus(LISTINGS[0]), 'active');
  assert.deepEqual(await pushed(), [
    ['seller', `The buyer cancelled order ${order.id} before pickup. Your listing is on sale again.`],
    ['rider', `Order ${order.id} was cancelled: don’t go to pick it up.`],
  ]);
  // Gone from the driver's list; the seller sees the reason.
  assert.ok(!(await call('GET', '/courier/deliveries', rider())).body.some((d: { orderId: string }) => d.orderId === order.id));
  assert.equal((await call('GET', `/orders/${order.id}`, seller())).body.cancel.reason, 'found_better');
  assert.equal((await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'changed_mind' })).status, 422);
});

test('B15.3 too late once the driver has it', async () => {
  const order = await paidOrder(LISTINGS[1]);
  await assign(order.id);
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/picked-up`, rider())).status, 200);
  const r = await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'changed_mind' });
  assert.equal(r.status, 422);
  assert.equal((await call('GET', `/orders/${order.id}`, buyer())).body.courierStatus, 'picked_up');
});

test('B15.4 the buyer reports a problem at the door; the driver sees it and marks it failed; refund without relisting', async () => {
  const order = (await prisma.order.findFirstOrThrow({ where: { listingId: LISTINGS[1] } }));
  await pushed();
  const issue = await call('POST', `/orders/${order.id}/problem`, buyer(), { reason: 'defect', note: 'The screen has a crack' });
  assert.equal(issue.status, 200);
  assert.deepEqual(issue.body.itemIssue.reason, 'defect');
  assert.deepEqual(await pushed(), [['rider', 'The buyer reported a problem: The item has a defect']]);
  const seen = (await call('GET', '/courier/deliveries', rider())).body.find((d: { orderId: string }) => d.orderId === order.id);
  assert.deepEqual([seen.buyerIssue.reason, seen.buyerIssue.note], ['defect', 'The screen has a crack']);

  // At the door: drop-off reasons only; the item is still with the driver.
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/failed`, rider(), { reason: 'seller_unavailable' })).status, 422);
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/failed`, rider2(), { reason: 'buyer_refused_defect' })).status, 404);
  const failed = await call('POST', `/courier/deliveries/${order.id}/failed`, rider(), { reason: 'buyer_refused_defect' });
  assert.equal(failed.status, 200);
  assert.deepEqual([failed.body.status, failed.body.failed.stage], ['failed', 'dropoff']);
  assert.deepEqual(await pushed(), [
    ['buyer', `Order ${order.id} wasn’t delivered: Buyer refused: the item has a defect. Sahla’s team will follow up.`],
    ['seller', `Order ${order.id} wasn’t delivered: Buyer refused: the item has a defect. Sahla’s team will follow up.`],
  ]);
  // No PIN while it's failed; the buyer sees why.
  const pin = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).pin;
  assert.equal((await call('POST', '/courier/confirm-delivery', rider(), { orderId: order.id, pin })).status, 422);
  assert.equal((await call('GET', `/orders/${order.id}`, buyer())).body.deliveryFailed.reason, 'buyer_refused_defect');

  // The dashboard's queue, then a refund that keeps the faulty item off sale.
  const queue = (await call('GET', '/admin/orders?problems=true', admin())).body;
  assert.ok(queue.some((o: { id: string; problem: boolean }) => o.id === order.id && o.problem));
  const detail = (await call('GET', `/admin/orders/${order.id}`, admin())).body;
  assert.deepEqual([detail.itemIssue.reason, detail.deliveryFailed.reason], ['defect', 'buyer_refused_defect']);
  assert.equal((await call('POST', `/admin/orders/${order.id}/resolve-problem`, buyer(), { action: 'refund' })).status, 403);
  const r = await call('POST', `/admin/orders/${order.id}/resolve-problem`, admin(), { action: 'refund', relist: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'refunded');
  assert.ok(await refunded(order.id));
  assert.equal(await listingStatus(LISTINGS[1]), 'withdrawn');
  assert.deepEqual(await pushed(), [
    ['buyer', `Order ${order.id} was refunded (94.700 JOD).`],
    ['seller', `Order ${order.id} was cancelled and the buyer refunded.`],
  ]);
  const action = await prisma.adminAction.findFirstOrThrow({ where: { action: 'order.problem_refund', targetId: order.id } });
  assert.ok(JSON.stringify(action.details).includes('buyer_refused_defect'));
  assert.equal((await call('POST', `/admin/orders/${order.id}/resolve-problem`, admin(), { action: 'retry' })).status, 422);
});

test('B15.4 failed at the seller; an admin retries with another driver, who then delivers', async () => {
  const order = await paidOrder(LISTINGS[2]);
  await assign(order.id);
  await pushed();
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/failed`, rider(), { reason: 'buyer_unavailable' })).status, 422);
  const r = await call('POST', `/courier/deliveries/${order.id}/failed`, rider(), { reason: 'seller_unavailable', note: 'Called twice' });
  assert.deepEqual([r.status, r.body.failed.stage, r.body.failed.note], [200, 'pickup', 'Called twice']);
  assert.deepEqual((await pushed()).map(p => p[0]), ['buyer', 'seller']);
  // Still on the first driver's list today, marked failed.
  const mine = (await call('GET', '/courier/deliveries', rider())).body.find((d: { orderId: string }) => d.orderId === order.id);
  assert.equal(mine.status, 'failed');

  const retry = await call('POST', `/admin/orders/${order.id}/resolve-problem`, admin(), { action: 'retry', courierId: rider2().id });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.courierStatus, 'to_pickup');
  assert.equal(retry.body.deliveryFailed, undefined);
  assert.deepEqual(await pushed(), [
    ['buyer', `We’ll try delivering order ${order.id} again.`],
    ['rider2', `Order ${order.id} is back on your list to try again.`],
  ]);
  assert.ok(!(await call('GET', '/courier/deliveries', rider())).body.some((d: { orderId: string }) => d.orderId === order.id));
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/picked-up`, rider2())).status, 200);
  const pin = (await call('GET', `/orders/${order.id}`, buyer())).body.pin;
  assert.equal((await call('POST', '/courier/confirm-delivery', rider2(), { orderId: order.id, pin })).status, 200);
  assert.equal(await listingStatus(LISTINGS[2]), 'sold');
  // B15.9: the seller's My sales shows the payout on its way.
  const sale = (await call('GET', '/me/sales', seller())).body.find((o: { id: string }) => o.id === order.id);
  assert.deepEqual(sale.payout, { status: 'pending', amountFils: 90_000 });
  assert.equal(sale.pin, undefined);
});

test('B15.3 an unpaid checkout can be cancelled too (nothing to refund)', async () => {
  const order = (await call('POST', '/orders', buyer(), { listingId: LISTINGS[3], delivery })).body;
  const r = await call('POST', `/orders/${order.id}/cancel`, buyer(), { reason: 'ordered_by_mistake' });
  assert.deepEqual([r.status, r.body.status], [200, 'cancelled']);
  assert.equal(await listingStatus(LISTINGS[3]), 'active');
});
