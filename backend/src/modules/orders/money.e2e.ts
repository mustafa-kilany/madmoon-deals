// SECURITY_PLAN S3: the money rules under attack. Two calls at the same moment
// have one effect (S3.4), impossible amounts are refused everywhere (S3.5), the
// PIN reaches only the buyer (S3.6), and a card number can't reach this server (S3.2).

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../../db';
import { dataSeal } from '../../lib/sealed';
import { cleanUp, DELIVERY, newListing, newPerson, paidOrder, startApi, type Person } from '../../lib/testkit';
import { fakePayments } from '../payments/fake';

const api = startApi();
const { call } = api;
const EMAILS = ['money.seller@example.com', 'money.buyer@example.com', 'money.buyer2@example.com', 'money.owner@sahla.jo', 'e2e.money.rider@sahla.jo'];
let seller: Person, buyer: Person, buyer2: Person, owner: Person, rider: Person;
const listings: string[] = [];
const listing = async (id: string, extra = {}) => {
  listings.push(id);
  return newListing(seller.id, id, extra);
};

/** Counts the provider's refunds, and makes each take a moment, as a real bank's would. */
const countRefunds = () => {
  const real = fakePayments.refund;
  const calls = { count: 0 };
  fakePayments.refund = async (ref, amount) => {
    calls.count++;
    await new Promise(resolve => setTimeout(resolve, 150));
    return real(ref, amount);
  };
  return { calls, restore: () => void (fakePayments.refund = real) };
};

before(async () => {
  await api.ready;
  await cleanUp([], EMAILS);
  seller = await newPerson(api, EMAILS[0], { payoutHolder: 'Money Seller', payoutIban: dataSeal('JO94CBJO0010000000000131000302'), payoutIbanLast4: '0302' });
  buyer = await newPerson(api, EMAILS[1]);
  buyer2 = await newPerson(api, EMAILS[2]);
  owner = await newPerson(api, EMAILS[3], { role: 'admin', adminRole: 'owner' });
  rider = await newPerson(api, EMAILS[4], { role: 'courier' });
});
after(async () => {
  api.close();
  await cleanUp(listings, EMAILS);
  await prisma.$disconnect();
});

test('M1: no admin answer carries the delivery PIN', async () => {
  await listing('money-pin');
  const { id, pin } = await paidOrder(api, buyer, 'money-pin');
  assert.match(pin, /^\d{4}$/);
  const answers = [
    await call('POST', `/admin/orders/${id}/assign`, owner, { courierId: rider.id }),
    await call('POST', `/admin/orders/${id}/unlock-pin`, owner),
    await call('GET', `/admin/orders/${id}`, owner),
  ];
  await prisma.order.update({ where: { id }, data: { courierStatus: 'failed', failedStage: 'pickup', failedReason: 'seller_unavailable', failedAt: new Date() } });
  answers.push(await call('POST', `/admin/orders/${id}/resolve-problem`, owner, { action: 'retry' }));
  for (const answer of answers) {
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.ok(!JSON.stringify(answer.body).includes(`"pin"`), `the PIN leaked: ${JSON.stringify(answer.body)}`);
  }
});

test('M3: a PIN can’t complete a delivery the driver never picked up', async () => {
  await listing('money-skip');
  const { id, pin } = await paidOrder(api, buyer, 'money-skip');
  await call('POST', `/admin/orders/${id}/assign`, owner, { courierId: rider.id });
  const early = await call('POST', '/courier/confirm-delivery', rider, { orderId: id, pin });
  assert.equal(early.status, 422, JSON.stringify(early.body));
  const row = await prisma.order.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, 'escrow_held');
  assert.equal(row.pinAttempts, 0, 'an early try uses up none of the 5');
});

test('M2/S3.4: two refunds at once reach the bank once', async () => {
  await listing('money-refund');
  const { id } = await paidOrder(api, buyer, 'money-refund');
  const { calls, restore } = countRefunds();
  try {
    const answers = await Promise.all([1, 2, 3].map(() => call('POST', `/admin/orders/${id}/refund`, owner)));
    assert.deepEqual(answers.map(a => a.status).sort(), [200, 422, 422]);
    assert.equal(calls.count, 1, 'the bank was asked to refund more than once');
  } finally {
    restore();
  }
});

test('M2/S3.4: a refund racing a delivery: never both money back and a payout', async () => {
  await listing('money-race');
  const { id, pin } = await paidOrder(api, buyer, 'money-race');
  await prisma.order.update({ where: { id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  const { calls, restore } = countRefunds();
  try {
    const [refund, confirm] = await Promise.all([
      call('POST', `/admin/orders/${id}/refund`, owner),
      new Promise(resolve => setTimeout(resolve, 40)).then(() => call('POST', '/courier/confirm-delivery', rider, { orderId: id, pin })),
    ]);
    const payout = await prisma.payout.findUnique({ where: { orderId: id } });
    const row = await prisma.order.findUniqueOrThrow({ where: { id } });
    assert.ok(!(calls.count > 0 && payout), `refunded AND paid out: ${refund.status} ${confirm.status} ${row.status}`);
    assert.equal(refund.status === 200, row.status === 'refunded');
    assert.equal(confirm.status === 200, row.status === 'completed');
  } finally {
    restore();
  }
});

test('S3.4: cancelling twice, paying twice, confirming twice, marking a payout twice', async () => {
  await listing('money-cancel');
  const cancelled = await paidOrder(api, buyer, 'money-cancel');
  const { calls, restore } = countRefunds();
  try {
    const answers = await Promise.all([1, 2].map(() => call('POST', `/orders/${cancelled.id}/cancel`, buyer, { reason: 'found_better' })));
    assert.deepEqual(answers.map(a => a.status).sort(), [200, 422], JSON.stringify(answers.map(a => a.body)));
    assert.equal(calls.count, 1);
  } finally {
    restore();
  }

  // Paying twice at once: one holds the money, the other is given back.
  await listing('money-pay');
  const checkout = await call('POST', '/orders', buyer, { listingId: 'money-pay', delivery: DELIVERY });
  await Promise.all([1, 2].map(() => call('POST', `/orders/${checkout.body.id}/pay`, buyer, { cardToken: 'mock_visa_4242' })));
  const payments = await prisma.payment.findMany({ where: { orderId: checkout.body.id } });
  assert.equal(payments.filter(p => p.status === 'succeeded').length, 1, JSON.stringify(payments.map(p => p.status)));
  assert.ok(payments.filter(p => p.status !== 'succeeded').every(p => fakePayments.isRefunded(p.providerRef)));

  // Two buyers paying for one listing: one order, the other's money back.
  await listing('money-rival');
  const [a, b] = await Promise.all([buyer, buyer2].map(who => call('POST', '/orders', who, { listingId: 'money-rival', delivery: DELIVERY })));
  const paid = await Promise.all([
    call('POST', `/orders/${a.body.id}/pay`, buyer, { cardToken: 'mock_visa_4242' }),
    call('POST', `/orders/${b.body.id}/pay`, buyer2, { cardToken: 'mock_visa_4242' }),
  ]);
  assert.deepEqual(paid.map(p => p.status).sort(), [200, 409]);
  assert.equal(await prisma.order.count({ where: { listingId: 'money-rival', status: 'escrow_held' } }), 1);

  // Confirming twice at once: one completes, one payout.
  await listing('money-confirm');
  const delivered = await paidOrder(api, buyer, 'money-confirm');
  await prisma.order.update({ where: { id: delivered.id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  const confirms = await Promise.all([1, 2].map(() => call('POST', '/courier/confirm-delivery', rider, { orderId: delivered.id, pin: delivered.pin })));
  assert.equal(confirms.filter(c => c.status === 200).length, 1, JSON.stringify(confirms.map(c => c.body)));
  assert.equal(await prisma.payout.count({ where: { orderId: delivered.id } }), 1);

  // The bank transfer marked twice at once: one audit entry.
  const payout = await prisma.payout.findUniqueOrThrow({ where: { orderId: delivered.id } });
  const marks = await Promise.all([1, 2].map(() => call('POST', `/admin/payouts/${payout.id}/paid`, owner, { reference: 'TR-1' })));
  assert.deepEqual(marks.map(m => m.status).sort(), [200, 422], JSON.stringify(marks.map(m => m.body)));
  assert.equal(await prisma.adminAction.count({ where: { action: 'payout.paid', targetId: delivered.id } }), 1);
});

test('S3.5: impossible amounts are refused on every money field', async () => {
  await listing('money-offer');
  await listing('money-auction', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 3_600_000), incrementFils: 1000 });
  const bad = [-1, 0, 1.5, 1e15, '100', null, Number.MAX_SAFE_INTEGER];
  for (const amount of bad) {
    const label = String(amount);
    assert.equal((await call('POST', '/listings/money-offer/offers', buyer, { amountFils: amount })).status, 422, `offer ${label}`);
    assert.equal((await call('POST', '/listings/money-auction/bids', buyer, { amountFils: amount })).status, 422, `bid ${label}`);
    assert.equal((await call('PATCH', '/listings/money-offer', seller, { priceFils: amount })).status, 422, `price ${label}`);
    assert.equal((await call('POST', '/listings', seller, { priceFils: amount })).status, 422, `new listing ${label}`);
  }
  const offer = await call('POST', '/listings/money-offer/offers', buyer, { amountFils: 50_000 });
  for (const amount of [...bad, 49_000])
    assert.equal((await call('POST', `/offers/${offer.body.offer.id}/respond`, seller, { status: 'countered', counterAmountFils: amount })).status, 422, `counter ${amount}`);
  // An order can't name its own price: extra fields are ignored, the server prices it.
  const order = await call('POST', '/orders', buyer, { listingId: 'money-offer', delivery: DELIVERY, totalFils: 1, itemPriceFils: 1 });
  assert.equal(order.body.itemPriceFils, 90_000);
});

test('S3.6: the PIN is four random digits and only the buyer ever sees it', async () => {
  await listing('money-eyes');
  const { id, pin } = await paidOrder(api, buyer, 'money-eyes');
  assert.match(pin, /^\d{4}$/);
  await prisma.order.update({ where: { id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  for (const [path, who] of [[`/orders/${id}`, seller], ['/me/sales', seller], ['/courier/deliveries', rider], [`/admin/orders/${id}`, owner], ['/admin/orders', owner]] as const) {
    const r = await call('GET', path, who);
    assert.equal(r.status, 200, path);
    assert.ok(!JSON.stringify(r.body).includes('"pin"'), path);
  }
  assert.equal((await call('GET', `/orders/${id}`, buyer2)).status, 404);
  assert.equal((await call('GET', `/orders/${id}`, buyer)).body.pin, pin);
});

test('S3.2: anything that looks like a card number is refused, and never stored', async () => {
  await listing('money-pan');
  const order = await call('POST', '/orders', buyer, { listingId: 'money-pan', delivery: DELIVERY });
  for (const pan of ['4242424242424242', '4242 4242 4242 4242', '4242-4242-4242-4242', '5555555555554444', '378282246310005']) {
    const pay = await call('POST', `/orders/${order.body.id}/pay`, buyer, { cardToken: pan });
    assert.equal(pay.status, 422, pan);
    // Our own guard must answer, before any provider: the fake one refuses these anyway, a real one might not.
    assert.match(pay.body.error.message, /never a card number/, pan);
    assert.ok(!JSON.stringify(pay.body).includes(pan.slice(0, 8)), 'the number must not come back in the error');
    const save = await call('POST', '/me/payment-card', buyer, { cardToken: pan });
    assert.equal(save.status, 422, pan);
    assert.match(save.body.error.message, /never a card number/, pan);
  }
  assert.equal(await prisma.payment.count({ where: { orderId: order.body.id } }), 0);
});

test('a winner finds an unpaid win without any push; a paid or withdrawn one leaves the list', async () => {
  const ended = new Date(Date.now() - 3_600_000);
  await listing('money-found', { saleType: 'auction', auctionEndsAt: ended, auctionClosedAt: ended, auctionWinnerId: buyer.id, bidCount: 1, incrementFils: 1000 });
  const ids = async (who: Person) => (await call('GET', '/me/auctions-won', who)).body.map((i: { id: string }) => i.id);
  assert.ok((await ids(buyer)).includes('money-found'));
  assert.ok(!(await ids(buyer2)).includes('money-found'));
  assert.equal((await call('GET', '/listings?q=money-found')).body.items.length, 0, 'it’s gone from browsing, so this list is the only way');
  const { id } = await paidOrder(api, buyer, 'money-found');
  assert.ok(id);
  assert.ok(!(await ids(buyer)).includes('money-found'), 'paid');
});

test('M10: an auction whose winner never pays can be withdrawn 48 hours after it ends, not before', async () => {
  const ended = new Date(Date.now() - 3_600_000);
  await listing('money-win', { saleType: 'auction', auctionEndsAt: ended, auctionClosedAt: ended, auctionWinnerId: buyer.id, bidCount: 1, incrementFils: 1000 });
  assert.equal((await call('DELETE', '/listings/money-win', seller)).status, 422, 'the winner still has time to pay');
  const old = new Date(Date.now() - 49 * 3_600_000);
  await prisma.listing.update({ where: { id: 'money-win' }, data: { auctionEndsAt: old, auctionClosedAt: old } });
  assert.equal((await call('DELETE', '/listings/money-win', seller)).status, 204);
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: 'money-win' } })).status, 'withdrawn');
  // Live with bids: still refused.
  await listing('money-live', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 3_600_000), bidCount: 2, incrementFils: 1000 });
  assert.equal((await call('DELETE', '/listings/money-live', seller)).status, 422);
});
