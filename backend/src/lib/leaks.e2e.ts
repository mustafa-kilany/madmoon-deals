// SECURITY_PLAN S2.6: walks the JSON of real answers, from every kind of caller, looking
// for fields that must never leave the server, and for things only some callers may see.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../db';
import { dataSeal } from './sealed';
import { cleanUp, DELIVERY, newListing, newPerson, paidOrder, PICKUP, startApi, type Person } from './testkit';

const api = startApi();
const { call } = api;
const EMAILS = ['leak.seller@example.com', 'leak.buyer@example.com', 'leak.stranger@example.com', 'e2e.leak.rider@sahla.jo', 'leak.owner@sahla.jo'];
const LISTINGS = ['leak-sale', 'leak-sold', 'leak-auction'];
let seller: Person, buyer: Person, stranger: Person, rider: Person, owner: Person;
let orderId = '';
let chatId = '';

/** Never in any answer, to anyone. */
const NEVER = ['passwordHash', 'password', 'totpSecret', 'tokenHash', 'codeHash', 'cardToken', 'nationalIdHash', 'stateHash', 'serialHashes', 'imageHash', 'ocrText', 'keyHash', 'payoutIban', 'providerData'];

function keysIn(value: unknown, path = '$', found: { key: string; path: string }[] = []) {
  if (Array.isArray(value)) value.forEach((item, i) => keysIn(item, `${path}[${i}]`, found));
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      found.push({ key, path: `${path}.${key}` });
      keysIn(child, `${path}.${key}`, found);
    }
  return found;
}
const check = (label: string, body: unknown, banned: string[] = []) => {
  const leaks = keysIn(body).filter(k => NEVER.includes(k.key) || banned.includes(k.key));
  assert.deepEqual(leaks.map(l => l.path), [], `${label} leaked`);
};

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  seller = await newPerson(api, EMAILS[0], { payoutHolder: 'Leak Seller', payoutIban: dataSeal('JO94CBJO0010000000000131000302'), payoutIbanLast4: '0302', cardToken: 'fakecard_visa_4242', cardBrand: 'visa', cardLast4: '4242' });
  buyer = await newPerson(api, EMAILS[1]);
  stranger = await newPerson(api, EMAILS[2]);
  rider = await newPerson(api, EMAILS[3], { role: 'courier' });
  owner = await newPerson(api, EMAILS[4], { role: 'admin', adminRole: 'owner' });
  await newListing(seller.id, 'leak-sale');
  await newListing(seller.id, 'leak-sold');
  await newListing(seller.id, 'leak-auction', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 3_600_000), incrementFils: 1000 });
  const order = await paidOrder(api, buyer, 'leak-sold');
  orderId = order.id;
  await prisma.order.update({ where: { id: orderId }, data: { courierId: rider.id, courierStatus: 'to_pickup' } });
  const offer = await call('POST', '/listings/leak-sale/offers', buyer, { amountFils: 50_000 });
  chatId = offer.body.chatId;
  await call('POST', `/chats/${chatId}/messages`, seller, { text: 'Hello' });
  await call('POST', '/listings/leak-auction/bids', buyer, { amountFils: 100_000 });
  await call('POST', '/support/messages', buyer, { text: 'A question' });
});
after(async () => {
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

test('public listing answers: no pickup details, emails or the bidders’ private data', async () => {
  const banned = ['pickupPhone', 'pickupAddress', 'pickupNotes', 'pickup', 'email', 'pin', 'delivery'];
  const answers = await Promise.all([
    call('GET', '/listings'),
    call('GET', '/listings?q=leak'),
    call('GET', '/listings/leak-sale'),
    call('GET', '/listings/leak-auction'),
    call('GET', '/listings/leak-auction/bids'),
  ]);
  for (const r of answers) {
    assert.equal(r.status, 200);
    check('a public listing answer', r.body, banned);
    const text = JSON.stringify(r.body);
    for (const secret of [PICKUP.phone, PICKUP.address, EMAILS[0], EMAILS[1]]) assert.ok(!text.includes(secret), secret);
  }
  // The pickup address isn't searchable either.
  const search = await call('GET', `/listings?q=${encodeURIComponent('Seller Street')}`);
  assert.ok(!JSON.stringify(search.body).includes('leak-'), 'found by its private address');
});

test('customers: their own profile and orders, nothing secret; other people’s emails never', async () => {
  const me = await call('GET', '/me', seller);
  check('GET /me', me.body, ['pin', 'role', 'adminRole', 'suspended']);
  assert.deepEqual(me.body.card, { brand: 'visa', last4: '4242' });
  for (const [path, who] of [
    ['/me/orders', buyer], ['/me/sales', seller], [`/orders/${orderId}`, buyer], [`/orders/${orderId}`, seller],
    ['/chats', buyer], ['/chats', seller], [`/chats/${chatId}/messages`, seller], ['/me/listings', seller], ['/me/blocked', seller],
    ['/support', buyer], ['/me/payout-account', seller], ['/me/export', seller],
  ] as const) {
    const r = await call('GET', path, who);
    assert.equal(r.status, 200, path);
    check(`GET ${path}`, r.body);
    const text = JSON.stringify(r.body);
    // The other side's email address, never.
    const other = who.id === seller.id ? EMAILS[1] : EMAILS[0];
    assert.ok(!text.includes(other), `${path} shows ${other}`);
  }
  // Only the buyer has the PIN; the seller's copy has no phone or address.
  const sale = await call('GET', `/orders/${orderId}`, seller);
  check('the seller’s order', sale.body, ['pin']);
  assert.deepEqual(Object.keys(sale.body.delivery).sort(), ['cityId', 'name'], 'of the delivery: the name and area only');
});

test('couriers: the job, no money or PIN', async () => {
  const r = await call('GET', '/courier/deliveries', rider);
  assert.equal(r.status, 200);
  check('GET /courier/deliveries', r.body, ['pin', 'pinAttempts', 'totalFils', 'email']);
  assert.ok(JSON.stringify(r.body).includes(orderId));
  check('GET /me (courier)', (await call('GET', '/me', rider)).body, ['adminRole']);
});

test('the dashboard: no secrets on any page, and never the PIN', async () => {
  const banned = ['pin'];
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[0] } });
  const pages = [
    '/admin/me', '/admin/stats', '/admin/analytics?days=7', '/admin/orders', `/admin/orders/${orderId}`, '/admin/payouts', '/admin/payouts?status=paid',
    '/admin/users', `/admin/users/${user.id}`, '/admin/actions', '/admin/couriers', '/admin/admins', '/admin/support', '/admin/reports', '/admin/risk-flags',
    '/admin/certificates', '/admin/refurbished/stores',
  ];
  const seen: string[] = [];
  for (const page of pages) {
    const r = await call('GET', page, owner);
    if (r.status === 404) continue;
    assert.equal(r.status, 200, `${page}: ${JSON.stringify(r.body)}`);
    seen.push(page);
    check(`GET ${page}`, r.body, banned);
  }
  assert.ok(seen.length >= 12, `only ${seen.join(', ')} answered`);
});

test('the same things from a stranger: 404, with no details in the error', async () => {
  for (const path of [`/orders/${orderId}`, `/chats/${chatId}/messages`]) {
    const r = await call('GET', path, stranger);
    assert.equal(r.status, 404);
    assert.deepEqual(Object.keys(r.body), ['error']);
    assert.ok(!JSON.stringify(r.body).includes(DELIVERY.phone));
  }
});
