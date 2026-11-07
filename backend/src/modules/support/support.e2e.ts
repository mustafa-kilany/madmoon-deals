// Support (BACKEND_PLAN B15.6): the support email and one chat per person with
// the support team. Customers and drivers write; support admins answer from the
// dashboard (push to the person, never the text); other admin types can't.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { adminToken } from '../admin/testing';
import { hashPassword } from '../auth/password';
import { fakePushes } from '../notifications/push';

let base = '';
const server = app.listen(0);
const EMAILS = ['help.buyer@example.com', 'e2e.help.rider@sahla.jo', 'e2e.help.support@sahla.jo', 'e2e.help.finance@sahla.jo'];
const people: { id: string; token: string }[] = [];
const [buyer, rider, support, finance] = [0, 1, 2, 3].map(i => () => people[i]);
const PHONE = 'fcm-help-buyer-0123456789abcdefghij';

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  const kinds = [{}, { role: 'courier' as const }, { role: 'admin' as const, adminRole: 'support' as const }, { role: 'admin' as const, adminRole: 'finance' as const }];
  for (const [i, email] of EMAILS.entries()) {
    const user = await prisma.user.create({ data: { name: ['Huda', 'Rider', 'Sara Support', 'Fadi Finance'][i], email, passwordHash, ...kinds[i] } });
    if (kinds[i].role === 'admin') people.push({ id: user.id, token: await adminToken(user.id) });
    else {
      const r = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'longenough' }),
      });
      people.push({ id: user.id, token: (await r.json()).token });
    }
  }
  await call('POST', '/me/devices', buyer(), { token: PHONE, platform: 'android', language: 'en' });
});
beforeEach(() => {
  fakePushes.sent.length = 0;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('the app shows the support email and an empty chat at first', async () => {
  const r = await call('GET', '/support', buyer());
  assert.equal(r.status, 200);
  assert.match(r.body.email, /@/);
  assert.deepEqual(r.body.messages, []);
});

test('a customer writes; support sees it waiting, answers; the customer gets a push and the reply', async () => {
  assert.equal((await call('POST', '/support/messages', buyer(), { text: '   ' })).status, 422);
  assert.equal((await call('POST', '/support/messages', buyer(), { text: 'x', orderId: 'SA-000000' })).status, 422);
  const sent = await call('POST', '/support/messages', buyer(), { text: 'My driver never came' });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.fromSupport, false);

  const inbox = (await call('GET', '/admin/support', support())).body;
  const mine = inbox.find((t: { userId: string }) => t.userId === buyer().id);
  assert.deepEqual([mine.open, mine.waiting, mine.lastMessage.text], [true, true, 'My driver never came']);

  // Other admin types can't open it.
  assert.equal((await call('GET', '/admin/support', finance())).status, 403);
  assert.equal((await call('POST', `/admin/support/${buyer().id}/messages`, finance(), { text: 'hi' })).status, 403);

  const thread = (await call('GET', `/admin/support/${buyer().id}`, support())).body;
  assert.equal(thread.user.email, EMAILS[0]);
  const reply = await call('POST', `/admin/support/${buyer().id}/messages`, support(), { text: 'Sorry! A new driver is on the way.' });
  assert.equal(reply.status, 201);
  await flushJobs();
  assert.deepEqual(
    fakePushes.sent.map(p => [p.token, p.message.body, p.message.data]),
    [[PHONE, 'The support team answered you.', { type: 'support', id: buyer().id }]],
  );
  const after = (await call('GET', '/admin/support', support())).body.find((t: { userId: string }) => t.userId === buyer().id);
  assert.equal(after.waiting, false);

  // The customer sees "Sahla support", not which admin answered.
  const chat = (await call('GET', '/support', buyer())).body.messages;
  assert.deepEqual(chat.map((m: { fromSupport: boolean; text: string }) => [m.fromSupport, m.text]), [
    [false, 'My driver never came'],
    [true, 'Sorry! A new driver is on the way.'],
  ]);
  assert.ok(chat.every((m: object) => !('senderName' in m)));
});

test('closing takes it off the open list until the person writes again; drivers can use support too', async () => {
  assert.equal((await call('POST', `/admin/support/${buyer().id}/close`, support())).status, 204);
  const open = (await call('GET', '/admin/support?open=true', support())).body;
  assert.ok(!open.some((t: { userId: string }) => t.userId === buyer().id));
  await call('POST', '/support/messages', buyer(), { text: 'One more thing' });
  assert.ok((await call('GET', '/admin/support?open=true', support())).body.some((t: { userId: string }) => t.userId === buyer().id));

  assert.equal((await call('POST', '/support/messages', rider(), { text: 'The seller is not answering the door' })).status, 201);
  assert.equal((await call('GET', `/admin/support/${rider().id}`, support())).body.user.role, 'courier');
  assert.equal((await call('GET', '/admin/support/nobody', support())).status, 404);
});
// The 30-messages limit is checked in src/lib/limits.e2e.ts (without the tests' multiplier).
