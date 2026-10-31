// Checkout (BACKEND_PLAN B7.2): the server prices the order (listing, accepted
// offer or winning bid + 3% protection + 2 JOD delivery), checks who may buy
// what, validates the delivery details, and keeps one unpaid order per listing.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['order.seller@example.com', 'order.buyer@example.com', 'order.other@example.com'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, other] = [0, 1, 2].map(i => () => people[i]);
const LISTINGS = ['order-chair', 'order-desk', 'order-auction', 'order-live-auction'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const delivery = {
  name: 'Layla Ahmad',
  phone: '+962 79 123 4567',
  cityId: 'amman-khalda',
  address: 'Wasfi Al-Tal St, building 12, floor 3',
};
const order = (listingId: string, who = buyer(), extra: object = {}) =>
  call('POST', '/orders', who, { listingId, delivery, ...extra });

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: email.split('.')[1].split('@')[0], email, password: 'longenough', code: '123456' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token });
  }
  const common = {
    category: 'furniture', type: 'chairs', imageUrls: ['https://images.example.com/chair.jpg'], condition: 'good' as const,
    locationId: 'amman-khalda', description: 'A sturdy wooden chair in good shape, light scratches on one leg only.',
    sellerUserId: people[0].id,
  };
  await prisma.listing.createMany({
    data: [
      { ...common, id: LISTINGS[0], titleAr: 'كرسي', titleEn: 'Chair', priceFils: 20_000 },
      { ...common, id: LISTINGS[1], titleAr: 'مكتب', titleEn: 'Desk', priceFils: 100_000 },
      // Ended a minute ago with the buyer as top bidder; the closing job hasn't run yet.
      { ...common, id: LISTINGS[2], titleAr: 'مزاد', titleEn: 'Auction', priceFils: 55_000, saleType: 'auction', incrementFils: 1000, auctionEndsAt: new Date(Date.now() - 60_000), bidCount: 2 },
      { ...common, id: LISTINGS[3], titleAr: 'مزاد', titleEn: 'Live auction', priceFils: 10_000, saleType: 'auction', incrementFils: 1000, auctionEndsAt: new Date(Date.now() + 86_400_000) },
    ],
  });
  await prisma.bid.createMany({
    data: [
      { listingId: LISTINGS[2], bidderId: people[2].id, amountFils: 50_000 },
      { listingId: LISTINGS[2], bidderId: people[1].id, amountFils: 55_000 },
    ],
  });
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('the server prices the order; the phone is stored as 07XXXXXXXX', async () => {
  const r = await order(LISTINGS[1], buyer(), { delivery: { ...delivery, notes: '  Ring twice  ' } });
  assert.equal(r.status, 201);
  const o = r.body;
  assert.match(o.id, /^SA-\d{6}$/);
  assert.deepEqual(
    [o.itemId, o.itemTitle.en, o.itemPriceFils, o.buyerProtectionFils, o.deliveryFils, o.totalFils, o.status, o.pin],
    [LISTINGS[1], 'Desk', 100_000, 3000, 2000, 105_000, 'awaiting_payment', undefined],
  );
  assert.deepEqual(o.delivery, { ...delivery, phone: '0791234567', notes: 'Ring twice' });

  // Cheap items: at least 1 JOD protection. Amounts in the body are ignored.
  const cheap = await order(LISTINGS[0], buyer(), { itemPriceFils: 1, totalFils: 1 });
  assert.deepEqual([cheap.body.itemPriceFils, cheap.body.buyerProtectionFils, cheap.body.totalFils], [20_000, 1000, 23_000]);
});

test('checking out again updates the unpaid order instead of adding one', async () => {
  const first = await order(LISTINGS[0], other());
  const again = await order(LISTINGS[0], other(), { delivery: { ...delivery, address: 'Mecca St, building 4' } });
  assert.equal(again.body.id, first.body.id);
  assert.equal(again.body.delivery.address, 'Mecca St, building 4');
  assert.equal(await prisma.order.count({ where: { listingId: LISTINGS[0], buyerId: other().id } }), 1);
});

test('an accepted offer sets the price; only the buyer’s own accepted offer', async () => {
  const { offer } = (await call('POST', `/listings/${LISTINGS[1]}/offers`, buyer(), { amountFils: 80_000 })).body;
  // Not accepted yet
  assert.equal((await order(LISTINGS[1], buyer(), { offerId: offer.id })).status, 422);
  await call('POST', `/offers/${offer.id}/respond`, seller(), { status: 'accepted' });

  const r = await order(LISTINGS[1], buyer(), { offerId: offer.id });
  assert.deepEqual([r.body.itemPriceFils, r.body.buyerProtectionFils, r.body.totalFils, r.body.offerId], [80_000, 2400, 84_400, offer.id]);
  assert.equal((await order(LISTINGS[1], other(), { offerId: offer.id })).status, 422); // someone else's offer
  assert.equal((await order(LISTINGS[0], buyer(), { offerId: offer.id })).status, 422); // another listing
});

test('auctions: only the winner, only after the end, at the winning bid', async () => {
  const live = await order(LISTINGS[3]);
  assert.deepEqual([live.status, live.body.error.code], [409, 'ITEM_UNAVAILABLE']);
  const loser = await order(LISTINGS[2], other());
  assert.deepEqual([loser.status, loser.body.error.code], [409, 'ITEM_UNAVAILABLE']);
  const won = await order(LISTINGS[2]);
  assert.deepEqual([won.status, won.body.itemPriceFils, won.body.totalFils], [201, 55_000, 58_650]);
});

test('who can buy what', async () => {
  const own = await order(LISTINGS[0], seller());
  assert.deepEqual([own.status, own.body.error.code], [403, 'FORBIDDEN']);
  assert.equal((await order('nope')).status, 404);

  await prisma.listing.update({ where: { id: LISTINGS[0] }, data: { status: 'reserved' } });
  assert.equal((await order(LISTINGS[0])).status, 409);
  await prisma.listing.update({ where: { id: LISTINGS[0] }, data: { status: 'active' } });

  await call('POST', '/me/blocked', seller(), { userId: other().id });
  assert.equal((await order(LISTINGS[0], other())).status, 409);
  await call('DELETE', `/me/blocked/${other().id}`, seller());
  assert.equal((await order(LISTINGS[0], other())).status, 201);

  const signedOut = await fetch(`${base}/orders`, { method: 'POST' });
  assert.equal(signedOut.status, 401);
});

test('delivery details are checked like the app’s checkout form', async () => {
  const bad = async (changes: object) => (await order(LISTINGS[0], buyer(), { delivery: { ...delivery, ...changes } })).status;
  assert.equal(await bad({ name: 'L' }), 422);
  assert.equal(await bad({ phone: '0612345678' }), 422); // a landline
  assert.equal(await bad({ cityId: 'paris' }), 422);
  assert.equal(await bad({ address: 'abc' }), 422);
  assert.equal(await bad({ notes: 'x'.repeat(201) }), 422);
  assert.equal((await call('POST', '/orders', buyer(), { listingId: LISTINGS[0] })).status, 422);
  assert.equal(await bad({ phone: '00962781234567' }), 201);
});

test('order history: the buyer’s orders, the seller’s paid sales, one order', async () => {
  const mine = (await call('GET', '/me/orders', buyer())).body;
  assert.ok(mine.length >= 3);
  assert.ok(mine.every((o: { createdAt: string }, i: number) => i === 0 || mine[i - 1].createdAt >= o.createdAt));
  assert.deepEqual((await call('GET', '/me/sales', seller())).body, []); // nothing paid yet

  const desk = mine.find((o: { itemId: string }) => o.itemId === LISTINGS[1]);
  const paid = (await call('POST', `/orders/${desk.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
  assert.deepEqual((await call('GET', `/orders/${desk.id}`, buyer())).body.pin, paid.pin);

  const [sale] = (await call('GET', '/me/sales', seller())).body;
  assert.deepEqual([sale.id, sale.status, sale.totalFils, sale.pin], [desk.id, 'escrow_held', desk.totalFils, undefined]);
  // The phone and address are for the courier only.
  assert.deepEqual(sale.delivery, { name: 'Layla Ahmad', cityId: 'amman-khalda' });
  assert.deepEqual((await call('GET', `/orders/${desk.id}`, seller())).body.delivery, sale.delivery);

  assert.equal((await call('GET', `/orders/${desk.id}`, other())).status, 404);
  const unpaid = mine.find((o: { status: string }) => o.status === 'awaiting_payment');
  assert.equal((await call('GET', `/orders/${unpaid.id}`, seller())).status, 404);
});
