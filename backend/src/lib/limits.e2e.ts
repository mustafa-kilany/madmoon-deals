// The real rate limits (SECURITY_PLAN S0.1–S0.2), without the tests' multiplier:
// card tries (card testing), paid certificate reads, support and chat spam.
// Refused tries count where they should (cards, certificates) and don't where
// only creations matter (new listings).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';

process.env.RATE_LIMIT_MULTIPLIER = '1'; // before the app reads its settings
process.env.TRUST_PROXY = '1'; // so the tests can come from many addresses
let base = '';
let server: Server;
let prisma: typeof import('../db').prisma;
const EMAIL = 'limits.person@example.com';
let token = '';

const post = async (path: string, body: unknown = {}) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.status;
};
/** The status of each of `n` tries. */
const tries = async (n: number, path: string, body?: unknown) => {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push(await post(path, body));
  return statuses;
};

before(async () => {
  const { app } = await import('../app');
  ({ prisma } = await import('../db'));
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const r = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Limits', email: EMAIL, password: 'longenough', acceptTerms: true, code: '123456' }),
  });
  token = (await r.json()).token;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('S0.1 five card tries an hour: paying and saving a card, refused tries count too', async () => {
  const pay = await tries(6, '/orders/SA-000000/pay', { cardToken: 'mock_visa_4242' });
  assert.deepEqual(pay, [404, 404, 404, 404, 404, 429]);
  const card = await tries(6, '/me/payment-card', { cardToken: '' });
  assert.deepEqual(card.slice(5), [429]);
});

test('S0.2 ten certificate checks a day (each costs a Google Vision read)', async () => {
  const statuses = await tries(11, '/test-certificates');
  assert.equal(statuses[9] === 429, false);
  assert.equal(statuses[10], 429);
});

test('S0.2 chat and support spam', async () => {
  const chat = await tries(61, '/chats/no-such-chat/messages', { text: 'hi' });
  assert.equal(chat[60], 429);
  const support = await tries(31, '/support/messages', { text: 'hello' });
  assert.equal(support[30], 429);
});

test('S0.2 new listings: refused ones don’t use up the day’s 20', async () => {
  const statuses = await tries(25, '/listings', { category: 'furniture' });
  assert.ok(statuses.every(s => s === 422));
});

const forgot = (email: string, ip: string) =>
  fetch(`${base}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email }),
  }).then(r => r.status);

test('A2 one email attacked from many addresses still hits a limit (5 × the per-address budget)', async () => {
  const email = 'limits.target@example.com';
  const statuses: number[] = [];
  for (let i = 0; i < 26; i++) statuses.push(await forgot(email, `198.51.100.${i + 1}`));
  assert.deepEqual(statuses.slice(0, 25), Array(25).fill(204));
  assert.equal(statuses[25], 429);
});

test('A2 one address trying many accounts hits a limit', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 301; i++) statuses.push(await forgot(`limits.spray${i}@example.com`, '203.0.113.200'));
  assert.deepEqual(statuses.slice(0, 300), Array(300).fill(204));
  assert.equal(statuses[300], 429);
});

test('A2 the pair limit: one address on one email gets the tight budget', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push(await forgot('limits.pair@example.com', '203.0.113.77'));
  assert.deepEqual(statuses, [204, 204, 204, 204, 204, 429]);
});
