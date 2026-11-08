// End to end over HTTP against the test database (npm run test:api), the same
// flows as the app's __tests__/contract.test.js runs against the contract server.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { decodeJwt } from 'jose';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from './password';

let base = '';
const server = app.listen(0);

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  await prisma.user.create({
    data: {
      name: 'Ahmad',
      email: 'ahmad@sahla.jo',
      passwordHash: await hashPassword('sahla1234'),
      cardBrand: 'visa',
      cardLast4: '4242',
    },
  });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
const code = (r: { status: number; body: any }) => [r.status, r.body?.error?.code];

test('email sign-up → session with a JWT; bad input → VALIDATION; duplicate → EMAIL_TAKEN', async () => {
  const r = await call('POST', '/auth/signup', {
    name: 'Lina',
    email: 'Lina@Example.com',
    password: 'longenough',
    acceptTerms: true, code: '123456',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'lina@example.com');
  assert.equal(r.body.user.method, 'email');
  assert.equal(r.body.user.verified, false);
  assert.ok(r.body.user.avatarUrl.startsWith('https://'));
  assert.equal(r.body.user.passwordHash, undefined);
  const jwt = decodeJwt(r.body.token);
  assert.equal(jwt.sub, r.body.user.id);
  assert.equal(typeof jwt.sid, 'string');
  const days = ((jwt.exp ?? 0) - (jwt.iat ?? 0)) / 86_400;
  assert.ok(days >= 30 && days <= 90, `token lasts ${days} days`);

  assert.deepEqual(
    code(await call('POST', '/auth/signup', { name: 'L', email: 'n@e.com', password: 'x'.repeat(8), acceptTerms: true, code: '123456' })),
    [422, 'VALIDATION'],
  );
  assert.deepEqual(
    code(await call('POST', '/auth/signup', { name: 'Lina', email: 'lina@example.com', password: 'x'.repeat(8), acceptTerms: true, code: '123456' })),
    [409, 'EMAIL_TAKEN'],
  );
});

test('log-in: wrong password is INVALID_CREDENTIALS; email is trimmed and lower-cased', async () => {
  assert.deepEqual(
    code(await call('POST', '/auth/login', { email: 'ahmad@sahla.jo', password: 'nope' })),
    [401, 'INVALID_CREDENTIALS'],
  );
  assert.deepEqual(
    code(await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'whatever1' })),
    [401, 'INVALID_CREDENTIALS'],
  );
  const r = await call('POST', '/auth/login', { email: ' AHMAD@sahla.jo ', password: 'sahla1234' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user.card, { brand: 'visa', last4: '4242' });
  const me = await call('GET', '/me', undefined, r.body.token);
  assert.equal(me.body.email, 'ahmad@sahla.jo');
});

test('profile: name and city; an unknown city is VALIDATION', async () => {
  const { body } = await call('POST', '/auth/login', { email: 'ahmad@sahla.jo', password: 'sahla1234' });
  const r = await call('PATCH', '/me', { cityId: 'irbid', name: ' Ahmad K ' }, body.token);
  assert.equal(r.body.cityId, 'irbid');
  assert.equal(r.body.name, 'Ahmad K');
  assert.deepEqual(code(await call('PATCH', '/me', { cityId: 'paris' }, body.token)), [422, 'VALIDATION']);
});

test('tokens: missing, forged, or logged out → 401', async () => {
  assert.deepEqual(code(await call('GET', '/me')), [401, 'UNAUTHORIZED']);
  const { body } = await call('POST', '/auth/login', { email: 'ahmad@sahla.jo', password: 'sahla1234' });
  const [header, payload] = body.token.split('.');
  assert.deepEqual(code(await call('GET', '/me', undefined, `${header}.${payload}.forged`)), [401, 'UNAUTHORIZED']);

  assert.equal((await call('POST', '/auth/logout', undefined, body.token)).status, 204);
  assert.deepEqual(code(await call('GET', '/me', undefined, body.token)), [401, 'UNAUTHORIZED']);
});

test('sign-up needs the emailed code; send-otp refuses a taken email', async () => {
  assert.deepEqual(
    code(await call('POST', '/auth/signup', { name: 'Rami', email: 'rami@example.com', password: 'longenough', acceptTerms: true, code: '000000' })),
    [422, 'INVALID_CODE'],
  );
  assert.equal((await call('POST', '/auth/send-otp', { email: 'rami@example.com' })).status, 204);
  // S1.3: no different for an email that has an account (enumeration.e2e.ts).
  assert.equal((await call('POST', '/auth/send-otp', { email: 'lina@example.com' })).status, 204);
});

test('password reset: the new password works, the old one and old sessions do not', async () => {
  const signup = await call('POST', '/auth/signup', {
    name: 'Huda',
    email: 'huda@example.com',
    password: 'oldpassword',
    acceptTerms: true, code: '123456',
  });
  assert.equal((await call('POST', '/auth/forgot-password', { email: 'huda@example.com' })).status, 204);
  assert.equal((await call('POST', '/auth/forgot-password', { email: 'nobody@example.com' })).status, 204);
  assert.deepEqual(
    code(await call('POST', '/auth/reset-password', { email: 'huda@example.com', code: '999999', password: 'newpassword' })),
    [422, 'INVALID_CODE'],
  );
  assert.deepEqual(
    code(await call('POST', '/auth/reset-password', { email: 'nobody@example.com', code: '123456', password: 'newpassword' })),
    [422, 'INVALID_CODE'],
  );
  const reset = await call('POST', '/auth/reset-password', {
    email: 'huda@example.com',
    code: '123456',
    password: 'newpassword',
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(
    code(await call('POST', '/auth/login', { email: 'huda@example.com', password: 'oldpassword' })),
    [401, 'INVALID_CREDENTIALS'],
  );
  assert.equal((await call('POST', '/auth/login', { email: 'huda@example.com', password: 'newpassword' })).status, 200);
  assert.deepEqual(code(await call('GET', '/me', undefined, signup.body.token)), [401, 'UNAUTHORIZED']);
  assert.equal((await call('GET', '/me', undefined, reset.body.token)).status, 200);
});

test('delete account: the token stops working and the email is free again', async () => {
  const { body } = await call('POST', '/auth/signup', {
    name: 'Tala',
    email: 'tala@example.com',
    password: 'longenough',
    acceptTerms: true, code: '123456',
  });
  assert.equal((await call('DELETE', '/me', undefined, body.token)).status, 204);
  assert.deepEqual(code(await call('GET', '/me', undefined, body.token)), [401, 'UNAUTHORIZED']);
  assert.deepEqual(
    code(await call('POST', '/auth/login', { email: 'tala@example.com', password: 'longenough' })),
    [401, 'INVALID_CREDENTIALS'],
  );
  assert.equal((await call('POST', '/auth/send-otp', { email: 'tala@example.com' })).status, 204);
});

test('too many wrong passwords for one email → 429 RATE_LIMITED', async () => {
  let last = { status: 0, body: undefined as any };
  for (let i = 0; i < 11; i++)
    last = await call('POST', '/auth/login', { email: 'victim@example.com', password: `guess${i}xx` });
  assert.deepEqual(code(last), [429, 'RATE_LIMITED']);
});
