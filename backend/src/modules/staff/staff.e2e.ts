// Courier accounts: made by an admin, never by sign-up (BACKEND_PLAN B14.1).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';
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

test('admins manage couriers from the dashboard: add, list, disable', async () => {
  await prisma.user.create({
    data: { name: 'E2E Admin', email: 'e2e.admin@sahla.jo', role: 'admin', passwordHash: await hashPassword('adminpass1') },
  });
  const { token } = (await post('/auth/login', { email: 'e2e.admin@sahla.jo', password: 'adminpass1' })).body;
  const get = async (path: string, t = token) =>
    (await fetch(base + path, { headers: { Authorization: `Bearer ${t}` } })).json();

  const outsider = await post('/admin/couriers', { name: 'E2E Outsider', email: 'van@gmail.com' }, token);
  assert.deepEqual([outsider.status, outsider.body.error.code], [422, 'VALIDATION']);
  const added = await post('/admin/couriers', { name: 'E2E Van', email: 'e2e.van.driver@sahla.jo' }, token);
  assert.equal(added.status, 201);
  assert.deepEqual([added.body.email, added.body.active], ['e2e.van.driver@sahla.jo', true]);
  assert.ok((await get('/admin/couriers')).some((c: { id: string }) => c.id === added.body.id));

  assert.equal((await post(`/admin/couriers/${added.body.id}/disable`, {}, token)).status, 204);
  const listed = (await get('/admin/couriers')).find((c: { id: string }) => c.id === added.body.id);
  assert.equal(listed.active, false);
  assert.equal((await post('/admin/couriers/nope/disable', {}, token)).status, 404);

  // Customers can't.
  const customer = await post('/auth/signup', { name: 'Customer', email: 'e2e.customer@example.com', password: 'longenough', code: '123456' });
  assert.equal((await post('/admin/couriers', { name: 'E2E X', email: 'e2e.x@sahla.jo' }, customer.body.token)).status, 403);
  await prisma.user.deleteMany({ where: { email: 'e2e.customer@example.com' } });
});
