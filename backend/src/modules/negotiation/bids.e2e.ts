// Bids and the auction end (BACKEND_PLAN B6.3, B6.4), and cheap polling (B6.5).

import assert from 'node:assert/strict';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { closeEndedAuctions } from './bids';

let base = '';
const server = app.listen(0);
const EMAILS = ['bid.seller@example.com', 'bid.a@example.com', 'bid.b@example.com'];
const NAMES = ['Seller', 'Aya', 'Basel'];
const people: { id: string; token: string }[] = [];
const AUCTION = 'bid-auction';
const QUIET = 'bid-quiet';

const bid = async (who: { token: string }, amountFils: number, listing = AUCTION) => {
  const r = await fetch(`${base}/listings/${listing}/bids`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountFils }),
  });
  return { status: r.status, body: await r.json() };
};
const item = async (id = AUCTION) => (await fetch(`${base}/listings/${id}`)).json();

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: NAMES[people.length], email, password: 'longenough', code: '123456' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token });
  }
  const common = {
    category: 'hobbies', type: 'collectibles', imageUrls: ['https://images.example.com/coin.jpg'], condition: 'good' as const,
    locationId: 'irbid', description: 'An old Jordanian coin from 1949 in a clear case, well kept and easy to read.',
    sellerUserId: people[0].id, saleType: 'auction' as const, incrementFils: 1000,
    auctionEndsAt: new Date(Date.now() + 86_400_000),
  };
  await prisma.listing.createMany({
    data: [
      { ...common, id: AUCTION, titleAr: 'عملة', titleEn: 'Coin', priceFils: 10_000 },
      { ...common, id: QUIET, titleAr: 'طابع', titleEn: 'Stamp', priceFils: 5000 },
    ],
  });
});
after(async () => {
  server.close();
  await prisma.listing.deleteMany({ where: { id: { in: [AUCTION, QUIET] } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('a bid must beat the current bid by the increment; the item follows', async () => {
  const [seller, a, b] = people;
  assert.equal((await bid(a, 10_500)).status, 422); // starting bid 10 + 1 increment
  const first = await bid(a, 11_000);
  assert.equal(first.status, 201);
  assert.deepEqual([first.body.bidderId, first.body.bidderName, first.body.amountFils], [a.id, 'Aya', 11_000]);
  assert.equal((await bid(b, 11_999)).status, 422);
  assert.equal((await bid(b, 15_000)).status, 201);
  assert.equal((await bid(seller, 20_000)).status, 403); // your own auction

  const now = await item();
  assert.deepEqual([now.priceFils, now.auction.bidCount], [15_000, 2]);
  const bids = await (await fetch(`${base}/listings/${AUCTION}/bids`)).json();
  assert.deepEqual(bids.map((x: { amountFils: number }) => x.amountFils), [15_000, 11_000]);
});

test('two bids at the same moment: one wins, the other is told to bid higher', async () => {
  const [, a, b] = people;
  const results = await Promise.all([bid(a, 16_000), bid(b, 16_000)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
  const now = await item();
  assert.deepEqual([now.priceFils, now.auction.bidCount], [16_000, 3]);
});

test('polled endpoints answer 304 when nothing changed (B6.5)', async () => {
  const first = await fetch(`${base}/listings/${AUCTION}/bids`);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  // Plain HTTP: fetch() adds "Cache-Control: no-cache" to conditional requests, which turns 304s off.
  const status = await new Promise<number | undefined>((resolve, reject) =>
    get(`${base}/listings/${AUCTION}/bids`, { headers: { 'If-None-Match': etag } }, res => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject),
  );
  assert.equal(status, 304);
});

test('at the end the highest bidder wins; no bids: no winner; no bids after the end', async () => {
  const [, a, b] = people;
  const top = await bid(b, 30_000);
  assert.equal(top.status, 201);
  await prisma.listing.updateMany({ where: { id: { in: [AUCTION, QUIET] } }, data: { auctionEndsAt: new Date(Date.now() - 1000) } });
  assert.equal((await bid(a, 40_000)).status, 422); // ended, even before the job runs

  assert.ok((await closeEndedAuctions()) >= 2);
  assert.equal((await item()).auction.winnerId, b.id);
  assert.equal((await item(QUIET)).auction.winnerId, undefined);
  assert.equal(await closeEndedAuctions(), 0, 'each auction is closed once');

  // Not an auction / not there
  const fixed = await prisma.listing.findFirst({ where: { saleType: 'fixed', status: 'active' }, select: { id: true } });
  if (fixed) assert.equal((await bid(a, 1_000_000, fixed.id)).status, 422);
  assert.equal((await bid(a, 1000, 'nope')).status, 404);
});
