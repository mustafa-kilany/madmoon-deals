// When the risk checker runs (BACKEND_PLAN B5.3): after sign-up, reports and
// blocks against an account, and nightly. It only adds flags to the admin queue.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { checkRecentAccounts } from './triggers';

let base = '';
const server = app.listen(0);
const SUSPECT = 'k8x2q9z7w1@10minutemail.com'; // disposable + machine-made: 40 points
const EMAILS = [SUSPECT, 'risk.target@example.com', 'risk.a@example.com', 'risk.b@example.com', 'risk.c@example.com'];
const people: { id: string; token: string }[] = [];

const signup = async (email: string) => {
  const r = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Risk', email, password: 'longenough', code: '123456' }),
  });
  const { token, user } = await r.json();
  return { id: user.id, token };
};
const flags = (userId: string) => prisma.riskFlag.count({ where: { userId, status: 'open' } });

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('a suspicious sign-up is flagged just after; the account keeps working', async () => {
  people.push(await signup(SUSPECT));
  assert.equal(await flags(people[0].id), 0); // not during the request
  await flushJobs();
  assert.equal(await flags(people[0].id), 1);
  assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${people[0].token}` } })).status, 200);
});

test('reports and blocks from different people check the account they’re about', async () => {
  for (const email of EMAILS.slice(1)) people.push(await signup(email));
  await flushJobs();
  const target = people[1];
  assert.equal(await flags(target.id), 0);
  for (const who of people.slice(2)) {
    await fetch(`${base}/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'user', targetId: target.id, reason: 'scam' }),
    });
    await fetch(`${base}/me/blocked`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: target.id }),
    });
  }
  await flushJobs();
  // 3 reporters (30) + 3 blockers (15) = 45 ≥ 40
  assert.equal(await flags(target.id), 1);
});

test('the nightly run checks recent accounts and adds no second open flag', async () => {
  const before = await prisma.riskFlag.count();
  const { checked, flagged } = await checkRecentAccounts();
  assert.ok(checked >= EMAILS.length);
  assert.ok(flagged >= 2); // the two above are still at the threshold…
  assert.equal(await prisma.riskFlag.count(), before); // …but already in the queue
});
