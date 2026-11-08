// Found by the load test (npm run load-test): many bids at once took every database connection
// while each still needed another one, and the whole server stalled for 5 seconds, then 500s.
// Everything inside a transaction must use that transaction's own connection.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../../db';
import { cleanUp, newListing, newPerson, startApi, type Person } from '../../lib/testkit';

const api = startApi();
const EMAILS = ['bidload.seller@example.com', ...Array.from({ length: 30 }, (_, i) => `bidload.${i}@example.com`)];
const LISTINGS = Array.from({ length: 5 }, (_, i) => `bidload-${i}`);
let bidders: Person[];

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  const seller = await newPerson(api, EMAILS[0]);
  bidders = await Promise.all(EMAILS.slice(1).map(email => newPerson(api, email)));
  for (const id of LISTINGS) await newListing(seller.id, id, { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 3_600_000), incrementFils: 100, priceFils: 1000 });
});
after(async () => {
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

test('many bids at once all get an answer, quickly, and the server keeps serving', async () => {
  const started = performance.now();
  const others = Array.from({ length: 10 }, () => api.call('GET', '/listings?limit=5'));
  const answers = await Promise.all(
    Array.from({ length: 120 }, (_, i) =>
      api.call('POST', `/listings/${LISTINGS[i % LISTINGS.length]}/bids`, bidders[i % bidders.length], { amountFils: 2000 + i * 500 }),
    ),
  );
  const elapsed = performance.now() - started;
  const statuses = answers.map(a => a.status);
  assert.ok(!statuses.includes(500), `${statuses.filter(s => s === 500).length} of 120 bids answered 500`);
  assert.ok(statuses.every(s => s === 201 || s === 422), [...new Set(statuses)].join(','));
  assert.ok(statuses.includes(201));
  assert.ok(elapsed < 4000, `took ${elapsed.toFixed(0)} ms: the server stalled`);
  for (const other of await Promise.all(others)) assert.equal(other.status, 200);

  // The books are right: each auction's price is its highest bid, and the count matches.
  for (const id of LISTINGS) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id } });
    const bids = await prisma.bid.findMany({ where: { listingId: id }, orderBy: { amountFils: 'desc' } });
    assert.equal(listing.bidCount, bids.length, id);
    assert.equal(listing.priceFils, bids[0]?.amountFils ?? 1000, id);
    for (let i = 1; i < bids.length; i++) assert.ok(bids[i - 1].amountFils >= bids[i].amountFils + 100 || bids[i].createdAt > bids[i - 1].createdAt, 'each accepted bid beat the price');
  }
});
