// Delivery (BACKEND_PLAN B7.6): the courier types the buyer's PIN. Right →
// completed, listing sold, a payout for the seller. Wrong → INVALID_PIN and
// nothing released; 5 tries lock the order. Couriers only.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { deleteOrders } from '../../lib/testkit';
import { hashPassword } from '../auth/password';

let base = '';
const server = app.listen(0);
const EMAILS = ['deliver.seller@example.com', 'deliver.buyer@example.com', 'e2e.rider@sahla.jo', 'e2e.rider2@sahla.jo'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, courier, courier2] = [0, 1, 2, 3].map(i => () => people[i]);
const LISTINGS = ['deliver-oven', 'deliver-fan'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const delivery = { name: 'Sara', phone: '0771234567', cityId: 'irbid', address: 'University St, building 7' };
/** A paid order: escrow_held, with the buyer's PIN, assigned to the courier (S2.2: only they confirm it). */
const paidOrder = async (listingId: string) => {
  const order = (await call('POST', '/orders', buyer(), { listingId, delivery })).body;
  const paid = (await call('POST', `/orders/${order.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
  await prisma.order.update({ where: { id: order.id }, data: { courierId: courier().id, courierStatus: 'picked_up' } });
  return paid;
};
const confirm = (orderId: string, pin: string, who = courier()) => call('POST', '/courier/confirm-delivery', who, { orderId, pin });
const wrong = (pin: string) => String((Number(pin) + 1) % 10_000).padStart(4, '0');

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const email of EMAILS) {
    const staff = email.endsWith('@sahla.jo');
    await prisma.user.create({ data: { name: email.split('@')[0], email, passwordHash, ...(staff && { role: 'courier' }) } });
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token });
  }
  await prisma.listing.createMany({
    data: LISTINGS.map(id => ({
      id, category: 'appliances', type: 'ovens', titleAr: 'فرن', titleEn: id, priceFils: 120_000,
      imageUrls: ['https://images.example.com/oven.jpg'], condition: 'excellent' as const, locationId: 'irbid',
      description: 'A gas oven with four burners and a grill, cleaned and checked, works perfectly.',
      sellerUserId: people[0].id,
    })),
  });
});
after(async () => {
  server.close();
  await deleteOrders({ listingId: { in: LISTINGS } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('the right PIN completes the order, sells the listing and pays the seller', async () => {
  const order = await paidOrder(LISTINGS[0]);
  const bad = await confirm(order.id, wrong(order.pin));
  assert.deepEqual([bad.status, bad.body.error.code], [422, 'INVALID_PIN']);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'escrow_held');
  assert.equal(await prisma.payout.count({ where: { orderId: order.id } }), 0);

  // The courier types the number in lower case: still found.
  const r = await confirm(order.id.toLowerCase(), order.pin);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'completed');
  assert.ok(r.body.deliveredAt);
  assert.equal(r.body.pin, undefined);
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: LISTINGS[0] } })).status, 'sold');
  const payout = await prisma.payout.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.deepEqual([payout.sellerUserId, payout.amountFils, payout.status], [seller().id, 120_000, 'pending']);
  const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.deepEqual([done.courierId, done.courierStatus], [courier().id, 'delivered']);

  // The buyer and seller see it delivered.
  assert.equal((await call('GET', `/orders/${order.id}`, buyer())).body.status, 'completed');
  assert.equal((await confirm(order.id, order.pin)).status, 422); // not waiting for delivery any more
});

test('five tries, even sent at once, then the order is locked', async () => {
  const order = await paidOrder(LISTINGS[1]);
  const guesses = await Promise.all(Array.from({ length: 8 }, (_, i) => confirm(order.id, String(i).padStart(4, '0') === order.pin ? '9999' : String(i).padStart(4, '0'))));
  const codes = guesses.map(g => g.body.error.code);
  assert.equal(codes.filter(c => c === 'INVALID_PIN').length, 5);
  assert.equal(codes.filter(c => c === 'RATE_LIMITED').length, 3);
  // Locked: even the right PIN is refused, and nothing is released.
  const right = await confirm(order.id, order.pin);
  assert.deepEqual([right.status, right.body.error.code], [429, 'RATE_LIMITED']);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'escrow_held');
});

test('couriers only; another courier’s delivery is not found', async () => {
  const order = await prisma.order.findFirstOrThrow({ where: { listingId: LISTINGS[1] } });
  const asBuyer = await confirm(order.id, order.pin!, buyer());
  assert.deepEqual([asBuyer.status, asBuyer.body.error.code], [403, 'FORBIDDEN']);
  // S2.2: an order assigned to nobody can't be confirmed by any courier, even with the right PIN.
  await prisma.order.update({ where: { id: order.id }, data: { courierId: null, pinAttempts: 0 } });
  assert.equal((await confirm(order.id, order.pin!)).status, 404);
  await prisma.order.update({ where: { id: order.id }, data: { courierId: courier2().id, pinAttempts: 0 } });
  assert.equal((await confirm(order.id, order.pin!)).status, 404);
  assert.equal((await confirm('SA-000000', '1234')).status, 404);
  assert.equal((await confirm(order.id, '12')).status, 422);
  // And couriers can't shop.
  assert.equal((await call('GET', '/me/orders', courier())).status, 403);
  assert.equal((await confirm(order.id, order.pin!, courier2())).body.status, 'completed');
});
