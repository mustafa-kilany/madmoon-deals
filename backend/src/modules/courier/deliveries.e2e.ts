// The courier flow (BACKEND_PLAN B14.3–B14.6): the seller gives the pickup
// address, an admin assigns the paid order, the courier sees pickup + drop-off,
// marks it picked up and delivers it with the buyer's PIN.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { adminToken } from '../admin/testing';
import { hashPassword } from '../auth/password';

let base = '';
const server = app.listen(0);
const EMAILS = ['route.seller@example.com', 'route.buyer@example.com', 'route.admin@example.com', 'e2e.van@sahla.jo', 'e2e.van2@sahla.jo'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, admin, courier, courier2] = [0, 1, 2, 3, 4].map(i => () => people[i]);
const LISTING = 'route-washer';

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const dropoff = { name: 'Rana', phone: '0799998887', cityId: 'amman-khalda', address: 'Wasfi Al-Tal St, building 40' };
const pickup = { name: 'Khaled', phone: '+962 78 555 1234', cityId: 'zarqa', address: 'Factory St, warehouse 3', notes: 'Call first' };

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const email of EMAILS) {
    const role = email.endsWith('@sahla.jo') ? 'courier' : email.startsWith('route.admin') ? 'admin' : undefined;
    await prisma.user.create({ data: { name: email.split('@')[0], email, passwordHash, ...(role && { role }) } });
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token: role === 'admin' ? await adminToken(user.id) : token });
  }
  await prisma.listing.create({
    data: {
      id: LISTING, category: 'appliances', type: 'washers', titleAr: 'غسالة', titleEn: 'Washer', priceFils: 150_000,
      imageUrls: ['https://images.example.com/washer.jpg'], condition: 'good', locationId: 'zarqa',
      description: 'An eight kilo front loading washing machine, quiet, all programs work fine.',
      sellerUserId: people[0].id,
    },
  });
});
after(async () => {
  server.close();
  await prisma.order.deleteMany({ where: { listingId: LISTING } });
  await prisma.listing.deleteMany({ where: { id: LISTING } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('pickup → assign → picked up → delivered, seen only by the assigned courier', async () => {
  const created = (await call('POST', '/orders', buyer(), { listingId: LISTING, delivery: dropoff })).body;
  // Not paid yet: not a sale, no pickup.
  assert.equal((await call('POST', `/orders/${created.id}/pickup`, seller(), pickup)).status, 404);
  const order = (await call('POST', `/orders/${created.id}/pay`, buyer(), { cardToken: 'mock_visa_4242' })).body;

  // The seller gives the pickup address (and sees it on the sale); nobody else can.
  assert.equal((await call('POST', `/orders/${order.id}/pickup`, buyer(), pickup)).status, 404);
  assert.equal((await call('POST', `/orders/${order.id}/pickup`, seller(), { ...pickup, phone: '123' })).status, 422);
  const sale = await call('POST', `/orders/${order.id}/pickup`, seller(), pickup);
  assert.deepEqual(sale.body.pickup, { ...pickup, phone: '0785551234' });

  // Before assigning, no courier sees it.
  assert.deepEqual((await call('GET', '/courier/deliveries', courier())).body, []);
  assert.equal((await call('POST', `/admin/orders/${order.id}/assign`, seller(), { courierId: courier().id })).status, 403);
  assert.equal((await call('POST', `/admin/orders/${order.id}/assign`, admin(), { courierId: buyer().id })).status, 422);
  assert.equal((await call('POST', `/admin/orders/${order.id}/assign`, admin(), { courierId: courier().id })).status, 200);

  const [delivery] = (await call('GET', '/courier/deliveries', courier())).body;
  assert.deepEqual(
    [delivery.orderId, delivery.status, delivery.itemTitle.en, delivery.pickup, delivery.dropoff],
    [order.id, 'to_pickup', 'Washer', { ...pickup, phone: '0785551234' }, dropoff],
  );
  assert.ok(delivery.assignedAt);
  assert.equal(delivery.pin, undefined); // the buyer tells the courier at the door
  assert.deepEqual((await call('GET', '/courier/deliveries', courier2())).body, []);
  assert.equal((await call('GET', '/courier/deliveries', buyer())).status, 403);

  // Only the assigned courier; only once.
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/picked-up`, courier2())).status, 404);
  const picked = await call('POST', `/courier/deliveries/${order.id.toLowerCase()}/picked-up`, courier());
  assert.deepEqual([picked.status, picked.body.status], [200, 'picked_up']);
  assert.ok(picked.body.pickedUpAt);
  assert.equal((await call('POST', `/courier/deliveries/${order.id}/picked-up`, courier())).status, 422);
  // With the courier now: the seller can't change the pickup, the admin can't reassign.
  assert.equal((await call('POST', `/orders/${order.id}/pickup`, seller(), pickup)).status, 422);
  assert.equal((await call('POST', `/admin/orders/${order.id}/assign`, admin(), { courierId: courier2().id })).status, 422);
  assert.equal((await call('POST', '/courier/confirm-delivery', courier2(), { orderId: order.id, pin: order.pin })).status, 404);

  const done = await call('POST', '/courier/confirm-delivery', courier(), { orderId: order.id, pin: order.pin });
  assert.equal(done.body.status, 'completed');
  // Delivered today: still on the list, marked delivered.
  const [today] = (await call('GET', '/courier/deliveries', courier())).body;
  assert.deepEqual([today.status, !!today.deliveredAt], ['delivered', true]);
});
