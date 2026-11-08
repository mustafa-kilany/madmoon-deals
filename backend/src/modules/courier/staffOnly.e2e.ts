// Couriers are staff (BACKEND_PLAN B14.2): every customer endpoint answers
// 403 FORBIDDEN for a courier token, and the courier endpoints answer 403 for
// a customer. A new customer endpoint belongs in CUSTOMER_ONLY below, so a
// forgotten requireCustomer fails this test.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';

let base = '';
const server = app.listen(0);
const EMAILS = { customer: 'staffonly.customer@example.com', courier: 'e2e.staffonly.courier@sahla.jo' };
const tokens = { customer: '', courier: '' };

/** [method, path]: buying, selling, chats, uploads, safety, account extras. */
const CUSTOMER_ONLY: [string, string][] = [
  ['GET', '/me/listings'],
  ['GET', '/me/auctions-won'],
  ['POST', '/listings'],
  ['PATCH', '/listings/any-id'],
  ['DELETE', '/listings/any-id'],
  ['POST', '/test-certificates'],
  ['POST', '/uploads/listing-photo'],
  ['POST', '/me/avatar'],
  ['GET', '/chats'],
  ['GET', '/chats/any-id/messages'],
  ['POST', '/chats/any-id/messages'],
  ['POST', '/listings/any-id/offers'],
  ['GET', '/offers/any-id'],
  ['POST', '/offers/any-id/respond'],
  ['POST', '/listings/any-id/bids'],
  ['POST', '/orders'],
  ['POST', '/orders/any-id/pay'],
  ['POST', '/orders/any-id/cancel'],
  ['POST', '/orders/any-id/problem'],
  ['GET', '/me/orders'],
  ['GET', '/me/sales'],
  ['GET', '/orders/any-id'],
  ['POST', '/me/payment-card'],
  ['DELETE', '/me/payment-card'],
  ['GET', '/me/payout-account'],
  ['PUT', '/me/payout-account'],
  ['POST', '/me/payout-account/code'],
  ['POST', '/reports'],
  ['POST', '/me/blocked'],
  ['GET', '/me/blocked'],
  ['DELETE', '/me/blocked/any-id'],
  ['POST', '/me/id-verification/sanad'],
  ['GET', '/geocode/reverse?lat=31.95&lng=35.91'],
];

const COURIER_ONLY: [string, string][] = [
  ['GET', '/courier/deliveries'],
  ['POST', '/courier/deliveries/any-id/picked-up'],
  ['POST', '/courier/deliveries/any-id/failed'],
  ['POST', '/courier/confirm-delivery'],
];

/** Both roles keep these: profile, log-out and push. */
const BOTH: [string, string][] = [['GET', '/me']];

const call = async (method: string, path: string, token: string) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
  });
  return { status: r.status, code: r.status === 204 ? undefined : (await r.json()).error?.code };
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const [role, email] of Object.entries(EMAILS) as [keyof typeof EMAILS, string][]) {
    await prisma.user.create({ data: { name: role, email, passwordHash, ...(role === 'courier' && { role: 'courier' }) } });
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    tokens[role] = (await r.json()).token;
  }
});

after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.$disconnect();
});

test('a courier gets FORBIDDEN from every customer endpoint', async () => {
  for (const [method, path] of CUSTOMER_ONLY) {
    const r = await call(method, path, tokens.courier);
    assert.deepEqual([r.status, r.code], [403, 'FORBIDDEN'], `${method} ${path}`);
  }
});

test('a customer gets FORBIDDEN from every courier endpoint', async () => {
  for (const [method, path] of COURIER_ONLY) {
    const r = await call(method, path, tokens.customer);
    assert.deepEqual([r.status, r.code], [403, 'FORBIDDEN'], `${method} ${path}`);
  }
});

test('both keep their profile; a courier still gets their own (empty) deliveries', async () => {
  for (const [method, path] of BOTH)
    for (const token of Object.values(tokens)) assert.equal((await call(method, path, token)).status, 200, `${method} ${path}`);
  assert.equal((await call('GET', '/courier/deliveries', tokens.courier)).status, 200);
});
