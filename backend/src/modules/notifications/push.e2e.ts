// Push notifications (BACKEND_PLAN B9.3) with the fake sender: who gets which
// push, in their phone's language, with the screen to open; never a chat
// message's text; phones that signed out or uninstalled get nothing.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { hashPassword } from '../auth/password';
import { closeEndedAuctions } from '../negotiation/bids';
import { adminToken } from '../admin/testing';
import { fakePushes } from './push';

let base = '';
const server = app.listen(0);
const ADMIN_EMAIL = 'e2e.push.admin@sahla.jo';
const EMAILS = ['push.seller@example.com', 'push.buyer@example.com', 'push.bidder@example.com', 'e2e.push.rider@sahla.jo'];
const people: { id: string; token: string; phone: string }[] = [];
const [seller, buyer, bidder, courier] = [0, 1, 2, 3].map(i => () => people[i]);
const LANGS = ['ar', 'en', 'en', 'en'] as const;
const LISTINGS = ['push-lamp', 'push-clock', 'push-auction'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
/** The pushes sent since the last call, as [who, title, body, data]. */
const sent = async () => {
  await flushJobs();
  const pushes = fakePushes.sent.splice(0).map(({ token, message }) => [
    people.findIndex(p => p.phone === token),
    message.title,
    message.body,
    message.data,
  ]);
  return pushes.map(([i, ...rest]) => [['seller', 'buyer', 'bidder', 'courier'][i as number], ...rest]);
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const [i, email] of EMAILS.entries()) {
    const staff = email.endsWith('@sahla.jo');
    await prisma.user.create({ data: { name: ['Huda', 'Omar', 'Lina', 'Rider'][i], email, passwordHash, ...(staff && { role: 'courier' }) } });
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const { token, user } = await r.json();
    const phone = `fcm-token-${i}-0123456789abcdefghijklmnop`;
    people.push({ id: user.id, token, phone });
    assert.equal((await call('POST', '/me/devices', people[i], { token: phone, platform: 'android', language: LANGS[i] })).status, 204);
  }
  const common = {
    category: 'furniture', type: 'lighting', imageUrls: ['https://images.example.com/lamp.jpg'], condition: 'good' as const,
    locationId: 'amman', description: 'A brass floor lamp with a linen shade, works well and the cable is new.',
    sellerUserId: people[0].id,
  };
  await prisma.listing.createMany({
    data: [
      { ...common, id: LISTINGS[0], titleAr: 'مصباح', titleEn: 'Lamp', priceFils: 100_000 },
      { ...common, id: LISTINGS[1], titleAr: 'ساعة', titleEn: 'Clock', priceFils: 30_000 },
      {
        ...common, id: LISTINGS[2], titleAr: 'مزاد مصباح', titleEn: 'Lamp auction', priceFils: 10_000,
        saleType: 'auction', incrementFils: 1000, auctionEndsAt: new Date(Date.now() + 86_400_000),
      },
    ],
  });
});
beforeEach(() => {
  fakePushes.sent.length = 0;
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: [...EMAILS, ADMIN_EMAIL] } } });
  await prisma.$disconnect();
});

test('offers and chat messages: to the other side, in their language, never the message text', async () => {
  const { offer, chatId } = (await call('POST', `/listings/${LISTINGS[0]}/offers`, buyer(), { amountFils: 80_000 })).body;
  assert.deepEqual(await sent(), [['seller', 'مصباح', 'عرض جديد: 80 د.أ', { type: 'offer', id: chatId }]]);

  await call('POST', `/offers/${offer.id}/respond`, seller(), { status: 'countered', counterAmountFils: 90_500 });
  assert.deepEqual(await sent(), [['buyer', 'Lamp', 'Counter-offer: 90.500 JOD', { type: 'offer', id: chatId }]]);

  // Three messages in a row: one push, without what was written.
  for (const text of ['Is it still there?', 'My address is 12 Rainbow St', 'Thanks'])
    await call('POST', `/chats/${chatId}/messages`, buyer(), { text });
  assert.deepEqual(await sent(), [['seller', 'مصباح', 'رسالة جديدة من Omar', { type: 'chat', id: chatId }]]);

  await call('POST', `/offers/${offer.id}/respond`, buyer(), { status: 'accepted' });
  assert.deepEqual(await sent(), [['seller', 'مصباح', 'تم قبول العرض: 90.500 د.أ', { type: 'offer', id: chatId }]]);
});

test('outbid goes to the bidder who was on top; the winner hears when the auction ends', async () => {
  const bid = (who: { token: string }, amountFils: number) => call('POST', `/listings/${LISTINGS[2]}/bids`, who, { amountFils });
  await bid(buyer(), 11_000);
  assert.deepEqual(await sent(), []); // nobody was outbid
  await bid(bidder(), 12_000);
  await bid(bidder(), 13_000); // over themselves: still one push for the buyer, with the latest price
  assert.deepEqual(await sent(), [
    ['buyer', 'Lamp auction', "You've been outbid: the bid is now 13 JOD", { type: 'outbid', id: LISTINGS[2] }],
  ]);

  await prisma.listing.update({ where: { id: LISTINGS[2] }, data: { auctionEndsAt: new Date(Date.now() - 1000) } });
  await closeEndedAuctions();
  assert.deepEqual(await sent(), [
    ['bidder', 'Lamp auction', 'You won the auction at 13 JOD. Pay to get it delivered.', { type: 'auction_won', id: LISTINGS[2] }],
  ]);
});

test('delivered: the buyer and the seller', async () => {
  const delivery = { name: 'Omar', phone: '0791234567', cityId: 'amman', address: 'Rainbow St, building 12' };
  const order = (await call('POST', '/orders', buyer(), { listingId: LISTINGS[1], delivery })).body;
  const paid = (await call('POST', `/orders/${order.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;
  // B15.1: the seller hears the moment it's paid, and nobody else can buy it any more.
  assert.deepEqual(await sent(), [
    ['seller', 'ساعة', 'تم البيع! دفع المشتري 30 د.أ. جهّز المنتج، سيأتي سائق سهلة لاستلامه.', { type: 'sale', id: order.id }],
  ]);
  const browse = (await call('GET', '/listings?limit=50', bidder())).body;
  assert.ok(!browse.items.some((i: { id: string }) => i.id === LISTINGS[1]), 'off browsing once paid');
  const second = await call('POST', '/orders', bidder(), { listingId: LISTINGS[1], delivery });
  assert.equal(second.status, 409);

  // B15.5: the driver hears about the job, the buyer when it's on the way.
  const adminUser = await prisma.user.create({ data: { name: 'Admin', email: ADMIN_EMAIL, role: 'admin', adminRole: 'owner' } });
  const admin = await adminToken(adminUser.id);
  assert.equal((await call('POST', `/admin/orders/${order.id}/assign`, { token: admin }, { courierId: courier().id })).status, 200);
  assert.deepEqual(await sent(), [['courier', 'Clock', `New delivery: order ${order.id}.`, { type: 'delivery', id: order.id }]]);
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/picked-up`, courier())).status, 200);
  assert.deepEqual(await sent(), [
    ['buyer', 'Clock', `Your order ${order.id} is on the way. Have your delivery PIN ready.`, { type: 'order', id: order.id }],
  ]);
  assert.equal((await call('POST', '/courier/confirm-delivery', courier(), { orderId: order.id, pin: paid.pin })).status, 200);
  assert.deepEqual(await sent(), [
    ['buyer', 'Clock', `Your order ${order.id} was delivered.`, { type: 'order', id: order.id }],
    ['seller', 'ساعة', 'تم التوصيل للمشتري. سيتم تحويل 30 د.أ إليك.', { type: 'sale', id: order.id }],
  ]);
});

test('no pushes after log-out or to an uninstalled app (the phone is forgotten)', async () => {
  // Uninstalled: Firebase answers "unregistered" once, and the phone is removed.
  fakePushes.gone.add(seller().phone);
  const chatId = (await prisma.chat.findFirstOrThrow({ where: { listingId: LISTINGS[0] } })).id;
  await call('POST', `/chats/${chatId}/messages`, buyer(), { text: 'Hello?' });
  assert.deepEqual(await sent(), []);
  assert.equal(await prisma.device.count({ where: { token: seller().phone } }), 0);

  // Log-out ends the phone's pushes with the sign-in.
  assert.equal(await prisma.device.count({ where: { token: buyer().phone } }), 1);
  await call('POST', '/auth/logout', buyer());
  assert.equal(await prisma.device.count({ where: { token: buyer().phone } }), 0);
});
