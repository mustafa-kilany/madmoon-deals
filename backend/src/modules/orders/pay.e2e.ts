// Paying (BACKEND_PLAN B7.4) with the fake provider: escrow + PIN + reserved
// listing, declined cards, the bank's card check (3-D Secure) and its callback,
// and two buyers racing for one listing (the first payment wins, the other is
// refunded).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { fakePayments } from '../payments/fake';

let base = '';
const server = app.listen(0);
const EMAILS = ['pay.seller@example.com', 'pay.buyer@example.com', 'pay.other@example.com'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, other] = [0, 1, 2].map(i => () => people[i]);
const LISTINGS = ['pay-bike', 'pay-tv', 'pay-lamp', 'pay-rug', 'pay-desk', 'pay-chair'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const delivery = { name: 'Omar', phone: '0781234567', cityId: 'salt', address: 'Main St, building 2' };
const checkout = async (listingId: string, who = buyer()) => (await call('POST', '/orders', who, { listingId, delivery })).body;
const pay = (orderId: string, cardToken: string, who = buyer()) => call('POST', `/orders/${orderId}/pay`, who, { cardToken });
const listingStatus = async (id: string) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).status;
/** The pretend bank page's button, then our callback page (redirects followed). */
const answerBank = async (paymentUrl: string, approved: boolean) => {
  const r = await fetch(`${paymentUrl}/answer?approved=${approved ? 1 : 0}`);
  return { status: r.status, url: r.url, html: await r.text() };
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: email.split('.')[1].split('@')[0], email, password: 'longenough', acceptTerms: true, code: '123456' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token });
  }
  await prisma.listing.createMany({
    data: LISTINGS.map((id, i) => ({
      id, category: 'hobbies', type: 'bikes', titleAr: 'دراجة', titleEn: `Item ${i}`, priceFils: 50_000,
      imageUrls: ['https://images.example.com/bike.jpg'], condition: 'good' as const, locationId: 'salt',
      description: 'A city bike with new tyres and brakes, ridden on weekends only, kept indoors.',
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

test('paying holds the money: escrow_held, a 4-digit PIN, the listing reserved', async () => {
  const order = await checkout(LISTINGS[0]);
  const r = await pay(order.id, 'mock_visa_4242');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'escrow_held');
  assert.match(r.body.pin, /^\d{4}$/);
  assert.equal(r.body.paymentUrl, undefined);
  assert.equal(await listingStatus(LISTINGS[0]), 'reserved');
  const [payment] = await prisma.payment.findMany({ where: { orderId: order.id } });
  assert.deepEqual([payment.status, payment.amountFils, payment.provider], ['succeeded', order.totalFils, 'fake']);

  assert.equal((await pay(order.id, 'mock_visa_4242')).status, 422); // already paid
  assert.equal((await pay(order.id, 'mock_visa_4242', other())).status, 404); // not your order
  assert.equal((await pay('SA-000000', 'mock_visa_4242')).status, 404);
});

test('a declined card: 402 PAYMENT_DECLINED, the order waits for another card', async () => {
  const order = await checkout(LISTINGS[1]);
  const declined = await pay(order.id, 'mock_mastercard_0002');
  assert.deepEqual([declined.status, declined.body.error.code], [402, 'PAYMENT_DECLINED']);
  assert.equal(await listingStatus(LISTINGS[1]), 'active');
  assert.equal((await pay(order.id, 'not-a-token')).status, 422);
  assert.equal((await pay(order.id, 'mock_visa_1111')).body.status, 'escrow_held');
});

test('the bank’s card check: paymentUrl, then the callback marks it paid (once)', async () => {
  const order = await checkout(LISTINGS[2]);
  const r = await pay(order.id, 'mock_visa_3155');
  assert.equal(r.body.status, 'awaiting_payment');
  assert.match(r.body.paymentUrl, /\/v1\/payments\/fake\/bank\/fake_pay_/);
  assert.equal(r.body.pin, undefined);
  // The app polls GET /orders/:id meanwhile; the page is still there.
  assert.equal((await fetch(r.body.paymentUrl)).status, 200);

  const page = await answerBank(r.body.paymentUrl, true);
  assert.equal(page.status, 200);
  assert.match(page.url, /\/v1\/payments\/callback\?ref=/);
  assert.match(page.html, /Payment done/);
  const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(paid.status, 'escrow_held');
  assert.match(paid.pin!, /^\d{4}$/);

  // The bank calling again changes nothing.
  const again = await fetch(page.url);
  assert.match(await again.text(), /Payment done/);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).pin, paid.pin);
  assert.equal((await fetch(`${base}/payments/callback?ref=nope`)).status, 404);
});

test('a declined card check leaves the order unpaid; the buyer can pay again', async () => {
  const order = await checkout(LISTINGS[3]);
  const { body } = await pay(order.id, 'mock_visa_3155');
  assert.match((await answerBank(body.paymentUrl, false)).html, /didn’t go through/);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, 'awaiting_payment');
  assert.equal(await listingStatus(LISTINGS[3]), 'active');
  assert.equal((await pay(order.id, 'mock_visa_4242')).body.status, 'escrow_held');
});

test('two buyers at once: the first payment wins; a late card check is refunded', async () => {
  // Both pay at the same moment.
  const [a, b] = [await checkout(LISTINGS[4], buyer()), await checkout(LISTINGS[4], other())];
  const results = await Promise.all([pay(a.id, 'mock_visa_4242', buyer()), pay(b.id, 'mock_visa_4242', other())]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const lost = results.find(r => r.status === 409)!;
  assert.equal(lost.body.error.code, 'ITEM_UNAVAILABLE');
  const charged = await prisma.payment.findMany({ where: { order: { listingId: LISTINGS[4] } } });
  // The loser was either refused before charging or refunded straight away.
  assert.ok(charged.filter(p => p.status === 'succeeded').length === 1);
  assert.ok(charged.every(p => p.status === 'succeeded' || (p.status === 'refunded' && fakePayments.isRefunded(p.providerRef))));

  // Someone mid card check while the listing sells: approved too late → refunded.
  await prisma.order.updateMany({ where: { listingId: LISTINGS[4] }, data: { status: 'refunded' } });
  await prisma.listing.update({ where: { id: LISTINGS[4] }, data: { status: 'active' } });
  const late = await checkout(LISTINGS[4], other());
  const { body } = await pay(late.id, 'mock_visa_3155', other());
  const first = await checkout(LISTINGS[4], buyer());
  assert.equal((await pay(first.id, 'mock_visa_4242', buyer())).body.status, 'escrow_held');
  assert.match((await answerBank(body.paymentUrl, true)).html, /someone else bought this first/);
  const refunded = await prisma.payment.findFirstOrThrow({ where: { orderId: late.id } });
  assert.equal(refunded.status, 'refunded');
  assert.ok(fakePayments.isRefunded(refunded.providerRef));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: late.id } })).status, 'awaiting_payment');
});

test('a saved card: kept as the provider’s token, charged with "saved", removable', async () => {
  const saved = await call('POST', '/me/payment-card', other(), { cardToken: 'mock_mastercard_5100' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.card, { brand: 'mastercard', last4: '5100' });
  assert.equal(JSON.stringify(saved.body).includes('fakecard'), false); // the token stays on the server
  assert.equal((await call('GET', '/me', other())).body.card.last4, '5100');
  assert.equal((await call('POST', '/me/payment-card', other(), { cardToken: '5100' })).status, 422);

  const order = await checkout(LISTINGS[5], other());
  assert.equal((await pay(order.id, 'saved', other())).body.status, 'escrow_held');

  const removed = await call('DELETE', '/me/payment-card', other());
  assert.equal(removed.body.card, undefined);
  const next = await checkout(LISTINGS[5], buyer()); // reserved now: refused before any charge
  assert.equal(next.error.code, 'ITEM_UNAVAILABLE');
  const again = await pay(order.id, 'saved', other());
  assert.equal(again.status, 422); // already paid
  const noCard = await pay('SA-000001', 'saved', buyer());
  assert.deepEqual([noCard.status, noCard.body.error.message], [422, 'cardToken: no saved card on this account']);
});
