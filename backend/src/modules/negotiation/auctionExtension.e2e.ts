// A bid in the last 45 seconds adds 45 seconds, never past 5 minutes after the end the seller set.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { WebSocket } from 'ws';
import { app } from '../../app';
import { prisma } from '../../db';
import { cleanUp, newListing, newPerson, startApi, type Person } from '../../lib/testkit';
import { closeEndedAuctions, EXTEND_BY_MS, EXTEND_LIMIT_MS, EXTEND_WITHIN_MS } from './bids';
import { attachLive } from './live';

const api = startApi();
const EMAILS = ['extend.seller@example.com', 'extend.a@example.com', 'extend.b@example.com'];
const ID = 'extend-auction';

let seller: Person;
let a: Person;
let b: Person;
let nextBid: number;

const secondsFromNow = (s: number) => new Date(Date.now() + s * 1000);
const listing = () => prisma.listing.findUniqueOrThrow({ where: { id: ID } });
const endsAt = async () => (await listing()).auctionEndsAt!.getTime();
const bid = (who: Person, amountFils = (nextBid += 1000)) => api.call('POST', `/listings/${ID}/bids`, who, { amountFils });
/** The auction now ends this many seconds from now, as the seller set it. */
const setEnd = (seconds: number, extra = {}) =>
  prisma.listing.update({ where: { id: ID }, data: { auctionEndsAt: secondsFromNow(seconds), auctionOriginalEndsAt: null, auctionClosedAt: null, auctionWinnerId: null, ...extra } });

before(async () => {
  await api.ready;
  await cleanUp([ID], EMAILS);
  [seller, a, b] = await Promise.all(EMAILS.map(email => newPerson(api, email)));
  await newListing(seller.id, ID, { saleType: 'auction', auctionEndsAt: secondsFromNow(3600), incrementFils: 100, priceFils: 1000 });
  nextBid = 2000;
});
beforeEach(() => setEnd(3600));
after(async () => {
  api.close();
  await cleanUp([ID], EMAILS);
  await prisma.$disconnect();
});

test('the settings are what was asked for', () => {
  assert.equal(EXTEND_WITHIN_MS, 45_000);
  assert.equal(EXTEND_BY_MS, 45_000);
  assert.equal(EXTEND_LIMIT_MS, 300_000);
});

test('with more than 45 seconds left, the end stays', async () => {
  await setEnd(60);
  const before = await endsAt();
  assert.equal((await bid(a)).status, 201);
  assert.equal(await endsAt(), before);
  assert.equal((await listing()).auctionOriginalEndsAt, null);
});

test('in the last 45 seconds, it adds 45 seconds', async () => {
  await setEnd(30);
  const before = await endsAt();
  assert.equal((await bid(a)).status, 201);
  assert.equal(await endsAt(), before + 45_000);
  assert.equal((await listing()).auctionOriginalEndsAt?.getTime(), before);
});

test('a refused bid moves nothing', async () => {
  await setEnd(30);
  const before = await endsAt();
  assert.equal((await bid(a, 1)).status, 422); // far too low
  assert.equal((await bid(seller)).status, 403); // their own auction
  assert.equal(await endsAt(), before);
  assert.equal((await listing()).auctionOriginalEndsAt, null);
});

test('it can repeat, 45 seconds at a time, and stops 5 minutes after the seller’s end', async () => {
  await setEnd(30);
  const sellersEnd = await endsAt();
  await prisma.listing.update({ where: { id: ID }, data: { auctionOriginalEndsAt: new Date(sellersEnd) } });
  // How far past the seller's end the auction runs, after each late bid.
  for (const [i, seconds] of [45, 90, 135, 180, 225, 270, 300, 300].entries()) {
    // Instead of waiting for time to pass, move both ends nearer together: 30 seconds left, same distance apart.
    const { auctionEndsAt, auctionOriginalEndsAt } = await listing();
    const shift = auctionEndsAt!.getTime() - (Date.now() + 30_000);
    await prisma.listing.update({
      where: { id: ID },
      data: { auctionEndsAt: new Date(auctionEndsAt!.getTime() - shift), auctionOriginalEndsAt: new Date(auctionOriginalEndsAt!.getTime() - shift) },
    });
    assert.equal((await bid(i % 2 ? a : b)).status, 201);
    const after = await listing();
    assert.equal(after.auctionEndsAt!.getTime() - after.auctionOriginalEndsAt!.getTime(), seconds * 1000, `bid ${i}`);
  }
});

test('the limit is counted from the seller’s end, not from wherever it has moved to', async () => {
  const original = secondsFromNow(-250);
  await prisma.listing.update({ where: { id: ID }, data: { auctionEndsAt: secondsFromNow(30), auctionOriginalEndsAt: original } });
  assert.equal((await bid(a)).status, 201);
  // 30 seconds from now is 280 s after the seller's end: only 20 more seconds fit.
  assert.equal(await endsAt(), original.getTime() + 300_000);
  assert.equal((await listing()).auctionOriginalEndsAt?.getTime(), original.getTime());
});

test('at the limit, a bid is still taken and the end stays', async () => {
  const original = secondsFromNow(-280);
  const limit = new Date(original.getTime() + 300_000); // 20 seconds from now
  await prisma.listing.update({ where: { id: ID }, data: { auctionEndsAt: limit, auctionOriginalEndsAt: original } });
  assert.equal((await bid(a)).status, 201);
  assert.equal(await endsAt(), limit.getTime());
});

test('once it has ended, a bid is refused and nothing moves', async () => {
  await setEnd(-1);
  const before = await endsAt();
  assert.equal((await bid(a)).status, 422);
  assert.equal(await endsAt(), before);
});

test('many late bids at once: the first moves the end out of the last 45 seconds, so it moves once', async () => {
  await setEnd(30);
  const original = await endsAt();
  const start = nextBid + 1000;
  const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => bid(i % 2 ? a : b, start + i * 1000)));
  nextBid = start + 12 * 1000;
  assert.ok(answers.some(r => r.status === 201));
  assert.ok(answers.every(r => r.status === 201 || r.status === 422));
  assert.equal(await endsAt(), original + 45_000);
});

test('everyone sees the new end: the listing and the live connection', async () => {
  const live = attachLive(api.server, app);
  try {
    for (let i = 0; i < 200 && !live.stats().listening; i++) await new Promise(r => setTimeout(r, 10));
    const ws = new WebSocket(`${api.url().replace(/^http/, 'ws')}/listings/${ID}/live`);
    const heard: { bid?: unknown; auctionEndsAt?: string }[] = [];
    ws.on('message', data => {
      const message = JSON.parse(String(data));
      if (message.type === 'bid') heard.push(message);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await setEnd(30);
    const before = await endsAt();
    assert.equal((await bid(a)).status, 201);
    for (let i = 0; i < 200 && !heard.length; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(heard[0]?.auctionEndsAt, new Date(before + 45_000).toISOString());
    const shown = await api.call('GET', `/listings/${ID}`);
    assert.equal(shown.body.auction.endsAt, new Date(before + 45_000).toISOString());
    assert.ok(!JSON.stringify(shown.body).includes('Original'), 'the seller’s first end is internal');
    ws.terminate();
  } finally {
    live.close();
  }
});

test('it closes at the new end, not the old one, and the last bidder wins', async () => {
  await setEnd(1);
  const winningAmount = (nextBid += 1000);
  assert.equal((await bid(b, winningAmount)).status, 201);
  await new Promise(r => setTimeout(r, 1200)); // the seller's end has passed
  await closeEndedAuctions();
  assert.equal((await listing()).auctionClosedAt, null, 'closed at the old end');

  // Time passes: now past the moved end too.
  await prisma.listing.update({ where: { id: ID }, data: { auctionEndsAt: secondsFromNow(-1) } });
  await closeEndedAuctions();
  const closed = await listing();
  assert.ok(closed.auctionClosedAt);
  assert.equal(closed.auctionWinnerId, b.id);
  assert.equal(closed.priceFils, winningAmount);
});

test('a bid can still be made in the extra time', async () => {
  await setEnd(1);
  assert.equal((await bid(a)).status, 201);
  await new Promise(r => setTimeout(r, 1200)); // past the seller's end, inside the extra 45 seconds
  assert.equal((await bid(b)).status, 201);
});
