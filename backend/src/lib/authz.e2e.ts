// SECURITY_PLAN S2 (the #1 API risk). Reads the server's own route table, so a new
// endpoint can't be forgotten:
// - every endpoint not on the PUBLIC list refuses a request with no token;
// - every admin endpoint refuses a customer's token (and an admin's refuses staff);
// - every customer endpoint with an id in its path is in OWNED below, where user B
//   tries it on user A's things. An id route that isn't listed fails the test.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app';
import { prisma } from '../db';
import { privateStorage } from './storage';
import { cleanUp, DELIVERY, newListing, newPerson, paidOrder, PASSWORD, startApi, type Person } from './testkit';
import { hashKey } from '../modules/refurbished/storeKeys';

const api = startApi();
const { call, raw } = api;
const EMAILS = ['authz.a@example.com', 'authz.b@example.com', 'e2e.authz.rider@sahla.jo', 'e2e.authz.rider2@sahla.jo', 'authz.admin@sahla.jo'];
const LISTINGS = ['authz-a', 'authz-offer', 'authz-order', 'authz-delivery', 'authz-store-a', 'authz-store-b'];
let a: Person, b: Person, rider: Person, rider2: Person, admin: Person;

type Route = { method: string; path: string };

/** Every route of the app, as "METHOD /path" relative to /v1. */
function allRoutes(): Route[] {
  const found: Route[] = [];
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) found.push({ method: method.toUpperCase(), path: layer.route.path });
      } else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((app as any).router.stack);
  return found;
}
const key = (r: Route) => `${r.method} ${r.path}`;
const concrete = (path: string) => path.replace(/:\w+/g, 'x');

/** Open to anyone, on purpose. Everything else must answer 401 with no token. */
const PUBLIC = new Set([
  'GET /health',
  'POST /auth/send-otp', 'POST /auth/signup', 'POST /auth/login', 'POST /auth/google', 'POST /auth/apple',
  'POST /auth/forgot-password', 'POST /auth/reset-password',
  'POST /admin/auth/login', 'POST /admin/auth/verify', // the second step checks its own 5-minute ticket
  'GET /legal', 'GET /legal/:doc',
  'GET /categories', 'GET /categories/filters', 'GET /cities', 'GET /listings', 'GET /listings/:id', 'POST /listings/:id/views',
  'GET /listings/:id/bids',
  // The bank's and Sanad's redirects land here in the phone's browser; they check the ref / state themselves.
  'GET /payments/callback', 'GET /id-verification/sanad/callback',
  'GET /payments/fake/bank/:ref', 'GET /payments/fake/bank/:ref/answer', // PAYMENT_MODE=fake only (never in production)
]);

/** Customer endpoints with an id: what user B gets on user A's thing. Keep this complete. */
const OWNED: Record<string, () => Promise<{ status: number; body?: unknown }>> = {};
let done: { orderId: string; chatId: string; offerId: string; deliveryId: string; pin: string };

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  a = await newPerson(api, EMAILS[0]);
  b = await newPerson(api, EMAILS[1]);
  rider = await newPerson(api, EMAILS[2], { role: 'courier' });
  rider2 = await newPerson(api, EMAILS[3], { role: 'courier' });
  admin = await newPerson(api, EMAILS[4], { role: 'admin', adminRole: 'owner' });

  // A's things: a listing on sale, an offer and a chat (with `rider`-free buyer A on B's…), an order.
  await newListing(a.id, 'authz-a');
  // B's listing, A made an offer: A and B are the two sides. For the "third person" tests a third user is below.
  await newListing(b.id, 'authz-order');
  const order = await paidOrder(api, a, 'authz-order');
  await newListing(b.id, 'authz-delivery');
  const delivery = await paidOrder(api, a, 'authz-delivery');
  await prisma.order.update({ where: { id: delivery.id }, data: { courierId: rider.id, courierStatus: 'to_pickup' } });
  done = { orderId: order.id, chatId: '', offerId: '', deliveryId: delivery.id, pin: delivery.pin };
});
after(async () => {
  api.close();
  await prisma.store.deleteMany({ where: { id: { in: ['authz-store-1', 'authz-store-2'] } } });
  await cleanUp(LISTINGS, [...EMAILS, 'authz.third@example.com']);
  await prisma.$disconnect();
});

test('every endpoint that isn’t public refuses a request with no token', async () => {
  const routes = allRoutes();
  assert.ok(routes.length > 90, `only ${routes.length} routes found: the route walker is broken`);
  const open: string[] = [];
  for (const route of routes) {
    if (PUBLIC.has(key(route))) continue;
    const r = await raw(concrete(route.path), { method: route.method, headers: { 'Content-Type': 'application/json' }, body: route.method === 'GET' ? undefined : '{}' });
    if (r.status !== 401) open.push(`${key(route)} → ${r.status}`);
  }
  assert.deepEqual(open, [], 'these answer without a token: add a guard, or add them to PUBLIC on purpose');
  for (const name of PUBLIC) assert.ok(routes.some(r => key(r) === name) || name.includes('/fake/'), `PUBLIC lists ${name}, which no longer exists`);
});

test('a forged, expired or wrong-kind token is the same as none', async () => {
  const [, payload] = a.token.split('.');
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
  const tampered = a.token.slice(0, -4) + (a.token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  for (const token of [none, tampered, 'garbage', `${a.token}x`]) {
    assert.equal((await call('GET', '/me', { token })).status, 401, token.slice(0, 20));
  }
  // A dashboard token opens nothing in the app, and an app token nothing in the dashboard.
  assert.equal((await call('GET', '/me', admin)).status, 401);
  assert.equal((await call('GET', '/admin/me', a)).status, 403);
  // An admin's password alone (the app's log-in) gives an app token: it must not skip the dashboard's second step.
  const appLogin = await call('POST', '/auth/login', null, { email: admin.email, password: PASSWORD });
  assert.equal(appLogin.status, 200);
  const adminAppToken = { token: appLogin.body.token as string };
  assert.equal((await call('GET', '/admin/me', adminAppToken)).status, 403, 'an admin’s app token opened the dashboard');
  assert.equal((await call('GET', '/admin/orders', adminAppToken)).status, 403);
  // Expired in the database, even with a valid signature.
  const session = await prisma.session.findFirstOrThrow({ where: { userId: b.id } });
  await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('GET', '/me', b)).status, 401);
  await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 3_600_000) } });
});

test('every admin endpoint refuses a customer and a courier', async () => {
  const bad: string[] = [];
  for (const route of allRoutes()) {
    if (!route.path.startsWith('/admin/') || PUBLIC.has(key(route))) continue;
    if (route.path.startsWith('/admin/auth/')) continue; // log-in and log-out of the dashboard itself
    for (const who of [a, rider]) {
      const r = await call(route.method, concrete(route.path), who, route.method === 'GET' ? undefined : {});
      // /admin/refurbished/* takes a store key: an app token is simply unauthorized there.
      const ok = route.path.startsWith('/admin/refurbished') && !route.path.startsWith('/admin/refurbished/stores') ? r.status === 401 : r.status === 403;
      if (!ok) bad.push(`${key(route)} → ${r.status}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('S2.1 user B on user A’s things: 403 or 404, and nothing changes', async () => {
  const third = await newPerson(api, 'authz.third@example.com');
  // A chat and offer between A (seller) and B (buyer): the third person is the outsider.
  await newListing(a.id, 'authz-offer');
  const made = await call('POST', '/listings/authz-offer/offers', b, { amountFils: 40_000 });
  assert.equal(made.status, 201);
  done.chatId = made.body.chatId;
  done.offerId = made.body.offer.id;

  const { orderId, chatId, offerId, deliveryId, pin } = done;
  const refused = (r: { status: number }) => r.status === 403 || r.status === 404;
  const cases: Record<string, () => Promise<{ status: number; body?: unknown }>> = {
    'GET /orders/:id': () => call('GET', `/orders/${orderId}`, third),
    'POST /orders/:id/pay': () => call('POST', `/orders/${orderId}/pay`, third, { cardToken: 'mock_visa_4242' }),
    'POST /orders/:id/cancel': () => call('POST', `/orders/${orderId}/cancel`, third, { reason: 'found_better' }),
    'POST /orders/:id/problem': () => call('POST', `/orders/${orderId}/problem`, third, { reason: 'defect' }),
    'GET /chats/:id/messages': () => call('GET', `/chats/${chatId}/messages`, third),
    'POST /chats/:id/messages': () => call('POST', `/chats/${chatId}/messages`, third, { text: 'hello' }),
    'GET /offers/:id': () => call('GET', `/offers/${offerId}`, third),
    'POST /offers/:id/respond': () => call('POST', `/offers/${offerId}/respond`, third, { status: 'accepted' }),
    'PATCH /listings/:id': () => call('PATCH', '/listings/authz-a', third, { priceFils: 1000 }),
    'DELETE /listings/:id': () => call('DELETE', '/listings/authz-a', third),
    'POST /courier/deliveries/:orderId/picked-up': () => call('POST', `/courier/deliveries/${deliveryId}/picked-up`, rider2),
    'POST /courier/deliveries/:orderId/failed': () => call('POST', `/courier/deliveries/${deliveryId}/failed`, rider2, { reason: 'seller_unavailable' }),
  };
  Object.assign(OWNED, cases);
  for (const [name, attempt] of Object.entries(cases)) {
    const r = await attempt();
    assert.ok(refused(r), `${name} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  // Nothing changed, nothing leaked.
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, 'escrow_held');
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: 'authz-a' } });
  assert.deepEqual([listing.priceFils, listing.status], [90_000, 'active']);
  assert.equal((await prisma.offer.findUniqueOrThrow({ where: { id: offerId } })).status, 'pending');
  assert.equal(await prisma.message.count({ where: { chatId, senderId: third.id } }), 0);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: deliveryId } })).courierStatus, 'to_pickup');

  // The right courier with someone else's order and a PIN: 404, no try used.
  assert.equal((await call('POST', '/courier/confirm-delivery', rider2, { orderId: deliveryId, pin })).status, 404);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: deliveryId } })).pinAttempts, 0);

  // An accepted offer is for the person who made it.
  assert.equal((await call('POST', `/offers/${offerId}/respond`, a, { status: 'accepted' })).status, 200);
  const stolen = await call('POST', '/orders', third, { listingId: 'authz-offer', offerId, delivery: DELIVERY });
  assert.equal(stolen.status, 422, JSON.stringify(stolen.body));
  // The other side of the deal may read it, and only they.
  assert.equal((await call('GET', `/offers/${offerId}`, a)).status, 200);
  assert.equal((await call('GET', `/offers/${offerId}`, b)).status, 200);

  // Someone's devices, block list and photos stay theirs.
  await prisma.device.create({ data: { token: 'authz-a-phone-token-000001', userId: a.id, platform: 'android' } });
  await call('DELETE', '/me/devices/authz-a-phone-token-000001', third);
  assert.equal(await prisma.device.count({ where: { token: 'authz-a-phone-token-000001' } }), 1);
  await call('POST', '/me/blocked', a, { userId: third.id });
  await call('DELETE', `/me/blocked/${third.id}`, third);
  assert.equal(await prisma.block.count({ where: { blockerId: a.id, blockedId: third.id } }), 1, 'only the blocker unblocks');

  // A's upload and certificate can't be used on someone else's listing.
  const upload = await prisma.upload.create({ data: { userId: a.id, kind: 'listing', url: '/files/listings/authz-a-photo.jpg', bytes: 1 } });
  const photoUrl = await privateStorage.put('certificates/authz.jpg', Buffer.from('x'));
  const certificate = await prisma.testCertificate.create({ data: { userId: a.id, status: 'passed', category: 'mobiles', type: 'phones', brand: 'Apple', photoUrl, ocrProvider: 'fake', ocrText: '', specs: [] } });
  const listing2 = {
    category: 'mobiles', type: 'phones', titleAr: 'هاتف جيد', titleEn: 'A good phone', priceFils: 100_000, condition: 'good', brand: 'Apple',
    description: 'A good phone in working order with a new battery and all its original parts.', locationId: 'amman', saleType: 'fixed',
    imageUrls: ['http://x/files/listings/authz-a-photo.jpg'], testCertificateId: certificate.id, pickup: { phone: '0791112223', address: 'Some Street, building 5' },
  };
  const taken = await call('POST', '/listings', third, listing2);
  assert.equal(taken.status, 422, JSON.stringify(taken.body));
  await prisma.upload.delete({ where: { id: upload.id } });
  await prisma.testCertificate.delete({ where: { id: certificate.id } });
  await privateStorage.remove(photoUrl);
});

test('S2.1 no customer endpoint with an id is missing from the table above', () => {
  // Fine without an owner check: `me` routes act only on the caller's own rows (checked above).
  const OWN_ROWS_ONLY = new Set([
    'DELETE /me/devices/:token', 'DELETE /me/blocked/:userId',
    'POST /listings/:id/offers', 'POST /listings/:id/bids', // anyone may offer or bid on a listing on sale
  ]);
  const missing = allRoutes()
    .filter(r => r.path.includes(':') && !r.path.startsWith('/admin/') && !PUBLIC.has(key(r)))
    .map(key)
    .filter(name => !OWNED[name] && !OWN_ROWS_ONLY.has(name));
  assert.deepEqual(missing, [], 'add these to the two-user test');
});

test('S2.3 a seller never sees the buyer’s phone or address; a courier only during the job', async () => {
  const { orderId, deliveryId } = done;
  for (const r of [await call('GET', `/orders/${orderId}`, b), await call('GET', '/me/sales', b)]) {
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes(DELIVERY.phone) && !text.includes(DELIVERY.address), text);
    assert.ok(text.includes(DELIVERY.name), 'the name and area are fine');
  }
  // An unpaid checkout isn't the seller's business at all.
  await newListing(b.id, 'authz-store-a');
  const unpaid = await call('POST', '/orders', a, { listingId: 'authz-store-a', delivery: DELIVERY });
  assert.equal((await call('GET', `/orders/${unpaid.body.id}`, b)).status, 404);

  // The assigned courier sees the addresses; the other one sees nothing.
  const job = () => call('GET', '/courier/deliveries', rider);
  const during = (await job()).body.find((d: { orderId: string }) => d.orderId === deliveryId);
  assert.equal(during.dropoff.phone, DELIVERY.phone);
  assert.ok(during.pickup.address.length > 0);
  assert.ok(!JSON.stringify((await call('GET', '/courier/deliveries', rider2)).body).includes(deliveryId));

  // Failed: names and areas only. After an admin's retry the driver gets them back.
  assert.equal((await call('POST', `/courier/deliveries/${deliveryId}/failed`, rider, { reason: 'seller_unavailable' })).status, 200);
  const failed = (await job()).body.find((d: { orderId: string }) => d.orderId === deliveryId);
  assert.deepEqual([failed.dropoff.phone, failed.dropoff.address, failed.pickup.phone, failed.pickup.address], ['', '', '', '']);
  assert.equal(failed.dropoff.name, DELIVERY.name);
  await call('POST', `/admin/orders/${deliveryId}/resolve-problem`, admin, { action: 'retry' });
  assert.equal((await job()).body.find((d: { orderId: string }) => d.orderId === deliveryId).dropoff.phone, DELIVERY.phone);

  // Delivered: the same.
  const order = await prisma.order.findUniqueOrThrow({ where: { id: deliveryId } });
  await call('POST', `/courier/deliveries/${deliveryId}/picked-up`, rider);
  assert.equal((await call('POST', '/courier/confirm-delivery', rider, { orderId: deliveryId, pin: order.pin })).status, 200);
  const delivered = (await job()).body.find((d: { orderId: string }) => d.orderId === deliveryId);
  assert.deepEqual([delivered.status, delivered.dropoff.phone, delivered.dropoff.address], ['delivered', '', '']);
});

test('S2.5 a store’s key only touches its own store; a revoked key is dead', async () => {
  await prisma.store.createMany({ data: [{ id: 'authz-store-1', nameEn: 'One', nameAr: 'واحد' }, { id: 'authz-store-2', nameEn: 'Two', nameAr: 'اثنان' }] });
  const secret = 'sahla_sk_authz-store-one-secret-key';
  await prisma.storeApiKey.create({ data: { storeId: 'authz-store-1', keyHash: hashKey(secret), label: 'test' } });
  await newListing(a.id, 'authz-store-b', { sellerUserId: null, storeId: 'authz-store-2', sku: 'SKU-2', condition: 'refurbished_good' });
  const store = { token: secret };

  const other = await call('POST', '/admin/refurbished/import', store, { storeId: 'authz-store-2', items: [] });
  assert.deepEqual([other.status, other.body.error.code], [403, 'FORBIDDEN']);
  assert.equal((await call('DELETE', '/admin/refurbished/authz-store-2/SKU-2', store)).status, 403);
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: 'authz-store-b' } })).status, 'active');
  assert.equal((await call('POST', '/admin/refurbished/import', store, { storeId: 'authz-store-1', items: [] })).status, 200);
  // The key opens only the import, not the dashboard or the app.
  assert.equal((await call('GET', '/admin/orders', store)).status, 401);
  assert.equal((await call('GET', '/me', store)).status, 401);

  await prisma.storeApiKey.updateMany({ where: { storeId: 'authz-store-1' }, data: { revokedAt: new Date() } });
  assert.equal((await call('POST', '/admin/refurbished/import', store, { storeId: 'authz-store-1', items: [] })).status, 401);
});
