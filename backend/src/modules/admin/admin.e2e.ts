// The admin dashboard log-in (BACKEND_PLAN B8.1): password, then a code from an
// authenticator app; dashboard tokens only open /v1/admin/*; the audit log.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { hashPassword } from '../auth/password';
import { currentStep, totpCode } from './totp';

let base = '';
const server = app.listen(0);
const ADMIN = 'e2e.dash.admin@sahla.jo';
const CUSTOMER = 'dash.customer@example.com';
const PASSWORD = 'adminpass1';

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const login = (email = ADMIN, password = PASSWORD) => call('POST', '/admin/auth/login', { email, password });

let secret = '';
let dashboard = '';

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({ data: { name: 'Dash Admin', email: ADMIN, passwordHash, role: 'admin', verified: true } });
  await prisma.user.create({ data: { name: 'Dash Customer', email: CUSTOMER, passwordHash } });
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN, CUSTOMER] } } });
  await prisma.$disconnect();
});

test('only admins with the right password get a ticket; the first one sets up the app', async () => {
  assert.deepEqual([(await login(ADMIN, 'wrongpass1')).status, (await login(ADMIN, 'wrongpass1')).body.error.code], [401, 'INVALID_CREDENTIALS']);
  assert.equal((await login('nobody@sahla.jo')).status, 401);
  assert.deepEqual([(await login(CUSTOMER)).status, (await login(CUSTOMER)).body.error.code], [403, 'FORBIDDEN']);

  const first = await login();
  assert.equal(first.status, 200);
  assert.ok(first.body.challenge);
  assert.match(first.body.setup.secret, /^[A-Z2-7]{32}$/);
  assert.match(first.body.setup.otpauthUrl, /^otpauth:\/\/totp\/Sahla%20Admin%3Ae2e\.dash\.admin%40sahla\.jo\?secret=/);
  secret = first.body.setup.secret;
  // Until a code is accepted, every try shows the same secret (the app already scanned it).
  assert.equal((await login()).body.setup.secret, secret);
  const stored = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
  assert.ok(stored.totpSecret && !stored.totpSecret.includes(secret)); // encrypted
});

test('the code finishes the log-in, once; later log-ins ask for a code only', async () => {
  const { challenge } = (await login()).body;
  const code = totpCode(secret, currentStep());
  const wrong = await call('POST', '/admin/auth/verify', { challenge, code: code === '000000' ? '111111' : '000000' });
  assert.deepEqual([wrong.status, wrong.body.error.code], [422, 'INVALID_CODE']);
  assert.equal((await call('POST', '/admin/auth/verify', { challenge: 'not-a-ticket-at-all-xxxxxxxx', code: '123456' })).status, 401);

  const ok = await call('POST', '/admin/auth/verify', { challenge, code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.expiresInHours, 12);
  assert.deepEqual(ok.body.admin, { id: ok.body.admin.id, name: 'Dash Admin', email: ADMIN });
  dashboard = ok.body.token;

  // The same code can't be used again, even with a new ticket.
  const again = await call('POST', '/admin/auth/verify', { challenge: (await login()).body.challenge, code });
  assert.deepEqual([again.status, again.body.error.code], [422, 'INVALID_CODE']);

  const later = await login();
  assert.equal(later.body.setup, undefined);
  const next = await call('POST', '/admin/auth/verify', { challenge: later.body.challenge, code: totpCode(secret, currentStep() + 1) });
  assert.equal(next.status, 200);
  const session = await prisma.session.findFirstOrThrow({ where: { user: { email: ADMIN }, scope: 'admin' } });
  const hours = (session.expiresAt.getTime() - session.createdAt.getTime()) / 3_600_000;
  assert.ok(hours > 11.9 && hours <= 12);
});

test('dashboard tokens open /admin/* only; app tokens never open it', async () => {
  assert.equal((await call('GET', '/admin/me', undefined, dashboard)).status, 200);
  assert.equal((await call('GET', '/admin/me')).status, 401);
  assert.equal((await call('GET', '/me', undefined, dashboard)).status, 401);

  // The same admin through the app's log-in: FORBIDDEN on /admin (the app must not sign out over it).
  const app = (await call('POST', '/auth/login', { email: ADMIN, password: PASSWORD })).body.token;
  const viaApp = await call('GET', '/admin/couriers', undefined, app);
  assert.deepEqual([viaApp.status, viaApp.body.error.code], [403, 'FORBIDDEN']);

  // No longer an admin, or suspended: refused at once.
  await prisma.user.update({ where: { email: ADMIN }, data: { suspended: true } });
  assert.equal((await call('GET', '/admin/me', undefined, dashboard)).status, 403);
  await prisma.user.update({ where: { email: ADMIN }, data: { suspended: false } });
});

test('the audit log lists log-ins and changes, newest first; log-out ends the token', async () => {
  const actions = await call('GET', '/admin/actions', undefined, dashboard);
  assert.equal(actions.status, 200);
  const mine = actions.body.filter((a: { admin: { email: string } | null }) => a.admin?.email === ADMIN);
  assert.deepEqual(mine.map((a: { action: string }) => a.action).slice(0, 2), ['admin.login', 'admin.2fa_setup']);

  await call('POST', '/admin/couriers', { name: 'E2E Dash Van', email: 'e2e.dash.van@sahla.jo' }, dashboard);
  const van = await prisma.user.findUniqueOrThrow({ where: { email: 'e2e.dash.van@sahla.jo' } });
  const forVan = await call('GET', `/admin/actions?targetType=user&targetId=${van.id}`, undefined, dashboard);
  assert.deepEqual(
    forVan.body.map((a: { action: string; target: unknown; details: unknown }) => [a.action, a.target, a.details]),
    [['courier.create', { type: 'user', id: van.id }, { email: 'e2e.dash.van@sahla.jo' }]],
  );
  await prisma.adminAction.deleteMany({ where: { targetId: van.id } });
  await prisma.user.delete({ where: { id: van.id } });

  assert.equal((await call('POST', '/admin/auth/logout', {}, dashboard)).status, 204);
  assert.equal((await call('GET', '/admin/me', undefined, dashboard)).status, 401);
});
