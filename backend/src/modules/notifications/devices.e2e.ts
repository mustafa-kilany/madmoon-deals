// Push tokens (BACKEND_PLAN B9.2): registered after sign-in, moved to whoever
// signs in on the phone next, removed on log-out and with the account.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['push.a@example.com', 'push.b@example.com'];
const tokens: string[] = [];
const PHONE = 'fcm-token-of-one-phone-0123456789abcdef';

const call = async (method: string, path: string, token: string, body?: unknown) =>
  (
    await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  ).status;
const owner = async () => (await prisma.device.findUnique({ where: { token: PHONE }, include: { user: true } }))?.user.email;

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Push', email, password: 'longenough', acceptTerms: true, code: '123456' }),
    });
    tokens.push((await r.json()).token);
  }
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('register, move to the next account on the phone, remove', async () => {
  assert.equal(await call('POST', '/me/devices', tokens[0], { token: PHONE, platform: 'android' }), 204);
  assert.equal(await call('POST', '/me/devices', tokens[0], { token: PHONE, platform: 'android' }), 204); // again: fine
  assert.equal(await owner(), EMAILS[0]);
  assert.equal(await call('POST', '/me/devices', tokens[0], { token: 'short', platform: 'android' }), 422);
  assert.equal(await call('POST', '/me/devices', tokens[0], { token: PHONE, platform: 'windows' }), 422);
  assert.equal(await call('POST', '/me/devices', tokens[0], { token: PHONE, platform: 'android', language: 'fr' }), 422);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { token: PHONE } })).language, 'en'); // the default

  assert.equal(await call('POST', '/me/devices', tokens[1], { token: PHONE, platform: 'ios' }), 204);
  assert.equal(await owner(), EMAILS[1]);
  // The first account can't remove what is now the second's.
  assert.equal(await call('DELETE', `/me/devices/${PHONE}`, tokens[0]), 204);
  assert.equal(await owner(), EMAILS[1]);
  assert.equal(await call('DELETE', `/me/devices/${PHONE}`, tokens[1]), 204);
  assert.equal(await owner(), undefined);

  await call('POST', '/me/devices', tokens[1], { token: PHONE, platform: 'ios' });
  assert.equal(await call('DELETE', '/me', tokens[1]), 204);
  assert.equal(await owner(), undefined); // gone with the account
});
