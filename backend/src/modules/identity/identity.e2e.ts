// ID verification with Sanad (backend/docs/ID-VERIFICATION.md), against the fake
// Sanad (SANAD_MODE=fake in npm run test:api): start → Sanad → callback → Verified.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { env } from '../../env';

let base = '';
const server = app.listen(0);
const EMAILS = ['sanad.one@example.com', 'sanad.two@example.com'];
const tokens: string[] = [];

const start = async (token = tokens[0]) => {
  const r = await fetch(`${base}/me/id-verification/sanad`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }), // B15.8
  });
  return { status: r.status, body: await r.json() };
};
/** What Sanad does: send the browser to our callback (here with any code we like). */
const callback = async (redirectUrl: string, override: Record<string, string> = {}) => {
  const url = new URL(redirectUrl);
  for (const [key, value] of Object.entries(override)) url.searchParams.set(key, value);
  const r = await fetch(url);
  return { status: r.status, html: await r.text() };
};
const me = async (token = tokens[0]) => (await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } })).json();

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nour', email, password: 'longenough', acceptTerms: true, code: '123456' }),
    });
    tokens.push((await r.json()).token);
  }
});
after(async () => {
  server.close();
  env.SANAD_MODE = 'fake';
  await prisma.listing.deleteMany({ where: { id: 'sanad-listing' } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('until Sanad is switched on, starting a check answers 503 SANAD_UNAVAILABLE', async () => {
  env.SANAD_MODE = 'off';
  const r = await start();
  env.SANAD_MODE = 'fake';
  assert.deepEqual([r.status, r.body.error.code], [503, 'SANAD_UNAVAILABLE']);
});

test('the old ID photo upload is gone', async () => {
  const r = await fetch(`${base}/me/id-verification`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}` } });
  assert.equal(r.status, 404);
});

test('cancelled in Sanad: not verified, and the link only works once', async () => {
  const { body } = await start();
  const cancelled = await callback(body.redirectUrl, { error: 'access_denied', code: '' });
  assert.equal(cancelled.status, 400);
  assert.match(cancelled.html, /cancelled/);
  assert.equal((await me()).verified, false);
  assert.match((await callback(body.redirectUrl)).html, /expired/);
});

test('approved in Sanad: Verified badge on the account and its listings; no national number stored', async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[0] } });
  await prisma.listing.create({
    data: {
      id: 'sanad-listing', category: 'kids', type: 'toys', titleAr: 'لعبة', titleEn: 'Toy', priceFils: 5000,
      imageUrls: ['https://images.example.com/toy.jpg'], condition: 'good', locationId: 'amman-khalda',
      description: 'A wooden toy train set with twelve pieces, complete and in good condition.',
      sellerUserId: user.id,
    },
  });
  const { body } = await start();
  const answered = await callback(body.redirectUrl, { code: 'fake-2000000001' });
  assert.equal(answered.status, 200);
  assert.match(answered.html, /verified/);
  assert.equal((await me()).verified, true);
  assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: 'sanad-listing' } })).sellerVerified, true);

  const [check] = await prisma.idVerification.findMany({ where: { userId: user.id, status: 'approved' } });
  assert.ok(check.nationalIdHash && !check.nationalIdHash.includes('2000000001'));
  assert.equal(check.stateHash, null);
  assert.equal((await start()).status, 422); // already verified
});

test('one national ID verifies one account', async () => {
  const { body } = await start(tokens[1]);
  const answered = await callback(body.redirectUrl, { code: 'fake-2000000001' });
  assert.match(answered.html, /another Madmoon Deals account/);
  assert.equal((await me(tokens[1])).verified, false);
});

test('a made-up state or code does nothing', async () => {
  const forged = await fetch(`${base}/id-verification/sanad/callback?state=nope&code=fake-2000000002`);
  assert.match(await forged.text(), /expired/);
  const { body } = await start(tokens[1]);
  assert.match((await callback(body.redirectUrl, { code: 'not-from-sanad' })).html, /couldn't check/);
  assert.equal((await me(tokens[1])).verified, false);
});
