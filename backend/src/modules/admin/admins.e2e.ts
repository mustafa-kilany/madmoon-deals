// Admin types (BACKEND_PLAN B15.7): each type opens only its endpoints; the
// owner manages admins; nobody changes themselves; the last owner stays.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import type { AdminRole } from '../../generated/prisma/client';
import { adminToken } from './testing';

let base = '';
const server = app.listen(0);
const ROLES = ['owner', 'operations', 'support', 'finance'] as const;
const emailOf = (role: string) => `e2e.types.${role}@sahla.jo`;
const NEW_ADMIN = 'e2e.types.new@sahla.jo';
const NO_TYPE = 'e2e.types.none@sahla.jo';
const admins: Record<string, { id: string; token: string }> = {};

const call = async (method: string, path: string, token: string, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const status = async (role: string, method: string, path: string, body?: unknown) =>
  (await call(method, path, admins[role].token, body)).status;

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const role of [...ROLES, 'none'] as const) {
    const user = await prisma.user.create({
      data: {
        name: `Types ${role}`,
        email: role === 'none' ? NO_TYPE : emailOf(role),
        role: 'admin',
        ...(role !== 'none' && { adminRole: role as AdminRole }),
      },
    });
    admins[role] = { id: user.id, token: await adminToken(user.id) };
  }
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: [...ROLES.map(emailOf), NEW_ADMIN, NO_TYPE] } } });
  await prisma.$disconnect();
});

test('GET /admin/me says the type and its permissions', async () => {
  const me = (await call('GET', '/admin/me', admins.finance.token)).body;
  assert.equal(me.adminRole, 'finance');
  assert.deepEqual(me.permissions, ['orders', 'refund', 'payouts', 'analytics']);
  assert.ok((await call('GET', '/admin/me', admins.owner.token)).body.permissions.includes('admins'));
});

test('each type opens only its pages', async () => {
  // Everyone: the overview and orders.
  for (const role of ROLES) {
    assert.equal(await status(role, 'GET', '/admin/stats'), 200, role);
    assert.equal(await status(role, 'GET', '/admin/orders'), 200, role);
  }
  const expect: [string, string, string, Record<string, number>][] = [
    ['GET', '/admin/payouts', 'payouts', { owner: 200, operations: 403, support: 403, finance: 200 }],
    ['GET', '/admin/analytics?days=7', 'analytics', { owner: 200, operations: 403, support: 403, finance: 200 }],
    ['GET', '/admin/reports/listings', 'reports', { owner: 200, operations: 403, support: 200, finance: 403 }],
    ['GET', '/admin/risk-flags', 'risk', { owner: 200, operations: 403, support: 200, finance: 403 }],
    ['GET', '/admin/certificates', 'certificates', { owner: 200, operations: 403, support: 200, finance: 403 }],
    ['GET', '/admin/couriers', 'couriers', { owner: 200, operations: 200, support: 403, finance: 403 }],
    ['GET', '/admin/refurbished/stores', 'stores', { owner: 200, operations: 200, support: 403, finance: 403 }],
    ['GET', '/admin/admins', 'admins', { owner: 200, operations: 403, support: 403, finance: 403 }],
  ];
  for (const [method, path, , byRole] of expect)
    for (const role of ROLES) assert.equal(await status(role, method, path), byRole[role], `${role} ${path}`);

  // Money moves: refunds are finance's (404 = allowed, no such order); assigning is dispatch.
  assert.equal(await status('support', 'POST', '/admin/orders/SA-000000/refund'), 403);
  assert.equal(await status('finance', 'POST', '/admin/orders/SA-000000/refund'), 404);
  assert.equal(await status('finance', 'POST', '/admin/orders/SA-000000/assign', { courierId: 'x' }), 403);
  assert.equal(await status('operations', 'POST', '/admin/orders/SA-000000/assign', { courierId: 'x' }), 404);
  // A delivery problem: retry needs dispatch, refund needs refund.
  assert.equal(await status('operations', 'POST', '/admin/orders/SA-000000/resolve-problem', { action: 'refund' }), 403);
  assert.equal(await status('operations', 'POST', '/admin/orders/SA-000000/resolve-problem', { action: 'retry' }), 404);
  assert.equal(await status('finance', 'POST', '/admin/orders/SA-000000/resolve-problem', { action: 'retry' }), 403);
  assert.equal(await status('support', 'POST', `/admin/users/${admins.none.id}/suspend`, { reason: 'test' }), 422);
  assert.equal(await status('finance', 'POST', `/admin/users/${admins.none.id}/suspend`, { reason: 'test' }), 403);

  // An admin without a type: only sign-in and out.
  assert.equal(await status('none', 'GET', '/admin/me'), 200);
  assert.equal(await status('none', 'GET', '/admin/orders'), 403);
});

test('the owner adds an admin, changes the type, disables and enables; the audit log has it', async () => {
  const created = await call('POST', '/admin/admins', admins.owner.token, { name: 'New Support', email: NEW_ADMIN, adminRole: 'support' });
  assert.equal(created.status, 201);
  assert.deepEqual([created.body.adminRole, created.body.twoFactor, created.body.active], ['support', false, true]);
  assert.equal((await call('POST', '/admin/admins', admins.owner.token, { name: 'Again', email: NEW_ADMIN, adminRole: 'finance' })).status, 409);
  assert.equal((await call('POST', '/admin/admins', admins.owner.token, { name: 'Outside', email: 'x@gmail.com', adminRole: 'finance' })).status, 422);
  assert.equal((await call('POST', '/admin/admins', admins.support.token, { name: 'Nope', email: 'e2e.nope@sahla.jo', adminRole: 'owner' })).status, 403);

  const id = created.body.id;
  const changed = await call('POST', `/admin/admins/${id}/role`, admins.owner.token, { adminRole: 'finance' });
  assert.deepEqual([changed.status, changed.body.adminRole], [200, 'finance']);

  // Disabling ends their sessions at once.
  const theirs = await adminToken(id);
  assert.equal((await call('GET', '/admin/orders', theirs)).status, 200);
  assert.equal((await call('POST', `/admin/admins/${id}/disable`, admins.owner.token)).status, 200);
  assert.equal((await call('GET', '/admin/orders', theirs)).status, 401);
  assert.equal((await call('POST', `/admin/admins/${id}/enable`, admins.owner.token)).body.active, true);

  const logged = await prisma.adminAction.findMany({ where: { targetId: id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(logged.map(a => a.action), ['admin.create', 'admin.role', 'admin.disable', 'admin.enable']);
});

test('nobody changes themselves; owners manage other owners', async () => {
  assert.equal((await call('POST', `/admin/admins/${admins.owner.id}/role`, admins.owner.token, { adminRole: 'finance' })).status, 422);
  assert.equal((await call('POST', `/admin/admins/${admins.owner.id}/disable`, admins.owner.token)).status, 422);
  // Another owner may demote an owner (two owners: one stays); the demoted one loses the Admins page at once.
  const second = await prisma.user.create({ data: { name: 'Owner Two', email: 'e2e.types.owner2@sahla.jo', role: 'admin', adminRole: 'owner' } });
  try {
    assert.equal((await call('POST', `/admin/admins/${second.id}/role`, admins.owner.token, { adminRole: 'operations' })).status, 200);
    assert.equal((await call('GET', '/admin/admins', await adminToken(second.id))).status, 403);
    // A disabled admin's token opens nothing.
    await prisma.user.update({ where: { id: second.id }, data: { suspended: true } });
    assert.equal((await call('GET', '/admin/orders', await adminToken(second.id))).status, 403);
  } finally {
    await prisma.user.delete({ where: { id: second.id } });
  }
});
