// Report and block (BACKEND_PLAN B5.1, B5.2). Blocks in chats, offers and bids
// are tested in negotiation.e2e.ts.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['safe.seller@example.com', 'safe.a@example.com', 'safe.b@example.com', 'safe.c@example.com'];
const users: { id: string; token: string }[] = [];
const LISTING = 'safety-listing';

const call = async (method: string, path: string, body: unknown, token: string) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const found = async (token?: string) => {
  const r = await fetch(`${base}/listings?category=kids&limit=50`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return ((await r.json()).items as { id: string }[]).some(i => i.id === LISTING);
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: email.split('@')[0], email, password: 'longenough', code: '123456' }),
    });
    const { token, user } = await r.json();
    users.push({ id: user.id, token });
  }
  await prisma.listing.create({
    data: {
      id: LISTING, category: 'kids', type: 'toys', titleAr: 'لعبة', titleEn: 'Toy', priceFils: 5000,
      imageUrls: ['https://images.example.com/toy.jpg'], condition: 'good', locationId: 'amman-khalda',
      description: 'A wooden toy train set with twelve pieces, complete and in good condition.',
      sellerUserId: users[0].id,
    },
  });
});
after(async () => {
  server.close();
  await prisma.listing.deleteMany({ where: { id: LISTING } });
  await prisma.report.deleteMany({ where: { targetId: LISTING } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('reports: checked, then three different people hide the listing from browsing', async () => {
  const [, a, b, c] = users;
  const bad = [
    [{ targetType: 'listing', targetId: LISTING, reason: 'boring' }, 422],
    [{ targetType: 'planet', targetId: LISTING, reason: 'scam' }, 422],
    [{ targetType: 'listing', targetId: 'nope', reason: 'scam' }, 404],
    [{ targetType: 'user', targetId: 'nope', reason: 'scam' }, 404],
    [{ targetType: 'listing', targetId: LISTING, reason: 'other', details: 'x'.repeat(501) }, 422],
  ] as const;
  for (const [body, status] of bad) assert.equal((await call('POST', '/reports', body, a.token)).status, status);

  const scam = { targetType: 'listing', targetId: LISTING, reason: 'scam', details: 'Asked me to pay outside the app' };
  assert.equal((await call('POST', '/reports', scam, a.token)).status, 204);
  assert.equal((await call('POST', '/reports', scam, a.token)).status, 204); // the same person twice counts once
  assert.equal((await call('POST', '/reports', scam, b.token)).status, 204);
  assert.ok(await found(), 'two reporters: still listed');
  assert.equal((await call('POST', '/reports', { ...scam, reason: 'wrong_info' }, c.token)).status, 204);
  assert.ok(!(await found()), 'three reporters: hidden until an admin looks');
  assert.equal((await call('POST', '/reports', { targetType: 'user', targetId: users[0].id, reason: 'offensive' }, a.token)).status, 204);

  await prisma.listing.update({ where: { id: LISTING }, data: { reportHidden: false } });
});

test('blocks work both ways in search, and are listed under Blocked users', async () => {
  const [seller, a] = users;
  assert.ok(await found(a.token));
  assert.equal((await call('POST', '/me/blocked', { userId: a.id }, seller.token)).status, 204);
  assert.equal((await call('POST', '/me/blocked', { userId: a.id }, seller.token)).status, 204); // twice is fine
  assert.ok(!(await found(a.token)), 'the blocked person no longer sees the seller');
  assert.ok(await found(), 'everyone else still does');

  assert.deepEqual((await call('GET', '/me/blocked', undefined, seller.token)).body, [{ id: a.id, name: 'safe.a' }]);
  assert.deepEqual((await call('GET', '/me/blocked', undefined, a.token)).body, []);
  assert.equal((await call('POST', '/me/blocked', { userId: seller.id }, seller.token)).status, 422);
  assert.equal((await call('POST', '/me/blocked', { userId: 'nope' }, seller.token)).status, 404);

  assert.equal((await call('DELETE', `/me/blocked/${a.id}`, undefined, seller.token)).status, 204);
  assert.ok(await found(a.token));
});
