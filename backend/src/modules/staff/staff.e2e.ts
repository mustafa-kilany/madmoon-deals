// Courier accounts: made by an admin, never by sign-up (BACKEND_PLAN B14.1).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { createCourier, disableCourier } from './service';

let base = '';
const server = app.listen(0);
before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { endsWith: '@sahla.jo' }, name: { startsWith: 'E2E' } } });
  await prisma.$disconnect();
});

const post = async (path: string, body: unknown, token?: string) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
};

test('nobody can sign up with the staff domain', async () => {
  const otp = await post('/auth/send-otp', { email: 'someone@SAHLA.jo' });
  assert.deepEqual([otp.status, otp.body.error.code], [422, 'VALIDATION']);
  const signup = await post('/auth/signup', {
    name: 'Fake Courier',
    email: 'fake@sahla.jo',
    password: 'longenough',
    code: '123456',
  });
  assert.deepEqual([signup.status, signup.body.error.code], [422, 'VALIDATION']);
});

test('an admin creates a courier; the invite code sets the password; they log in as a courier', async () => {
  await assert.rejects(createCourier({ name: 'E2E Outsider', email: 'driver@gmail.com' }));
  const courier = await createCourier({ name: 'E2E Driver', email: 'E2E.Driver@sahla.jo' });
  assert.equal(courier.role, 'courier');
  assert.equal(courier.passwordHash, null); // can't log in until they choose a password

  const reset = await post('/auth/reset-password', {
    email: 'e2e.driver@sahla.jo',
    code: '123456', // the emailed invite code (DEV_EMAIL_CODE in tests)
    password: 'driverpass1',
  });
  assert.equal(reset.status, 200);
  const login = await post('/auth/login', { email: 'e2e.driver@sahla.jo', password: 'driverpass1' });
  assert.equal(login.body.user.role, 'courier');

  await assert.rejects(createCourier({ name: 'E2E Driver', email: 'e2e.driver@sahla.jo' })); // already one

  await disableCourier('e2e.driver@sahla.jo');
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${login.body.token}` } });
  assert.equal(me.status, 401); // sessions ended
  const again = await post('/auth/login', { email: 'e2e.driver@sahla.jo', password: 'driverpass1' });
  assert.deepEqual([again.status, again.body.error.code], [403, 'FORBIDDEN']);
});
