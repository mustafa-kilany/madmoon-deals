// GET /geocode/reverse (BACKEND_PLAN B7.1) with the fake geocoder: a street for
// a fix in Jordan, "" elsewhere, bad coordinates refused, 20 lookups an hour.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAIL = 'geo.buyer@example.com';
let token = '';
const lookup = async (q: string) => {
  const r = await fetch(`${base}/geocode/reverse?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const r = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Geo', email: EMAIL, password: 'longenough', acceptTerms: true, code: '123456' }),
  });
  token = (await r.json()).token;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('a street in the buyer’s language; nothing outside Jordan; bad input refused; 20 an hour', async () => {
  const ar = await lookup('lat=32.03714&lng=35.72783&lang=ar'); // Salt
  assert.equal(ar.status, 200);
  assert.match(ar.body.address, /^الشارع الرئيسي، /);
  assert.match((await lookup('lat=32.03714&lng=35.72783&lang=en')).body.address, /^Main Street, /);
  assert.deepEqual((await lookup('lat=48.85&lng=2.35')).body, { address: '' }); // Paris
  assert.equal((await lookup('lat=95&lng=35')).status, 422);
  assert.equal((await lookup('lng=35')).status, 422);
  assert.equal((await lookup('lat=32&lng=35&lang=fr')).status, 422);
  assert.equal((await fetch(`${base}/geocode/reverse?lat=32&lng=35`)).status, 401);

  for (let i = 6; i < 20; i++) await lookup('lat=31.95&lng=35.91');
  const limited = await lookup('lat=31.95&lng=35.91');
  assert.deepEqual([limited.status, limited.body.error.code], [429, 'RATE_LIMITED']);
});
