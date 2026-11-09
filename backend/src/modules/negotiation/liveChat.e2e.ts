// Live chat and unread counts (GET /v1/me/live, POST /chats/:id/read): real server, database and sockets.
// The connection is signed in and only ever says what changed; the content stays behind the normal API.

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test as nodeTest } from 'node:test';
import { WebSocket } from 'ws';
import { app } from '../../app';
import { prisma } from '../../db';
import { cleanUp, newListing, newPerson, startApi, type Person } from '../../lib/testkit';
import { post } from './chats';
import { attachLive } from './live';

const api = startApi();
const EMAILS = ['livechat.seller@example.com', 'livechat.buyer@example.com', 'livechat.other@example.com', 'livechat.rider@example.com', 'e2e.livechat.support@sahla.jo'];
const LISTINGS = ['livechat-one', 'livechat-two'];

let seller: Person;
let buyer: Person;
let other: Person;
let rider: Person;
let support: Person;
let live: ReturnType<typeof attachLive>;
let chatId: string;
let secondChatId: string;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (what: string, ok: () => boolean, ms = 5000) => {
  const started = Date.now();
  while (!ok()) {
    if (Date.now() - started > ms) assert.fail(`Waited ${ms} ms for: ${what}`);
    await sleep(5);
  }
};

// A failed or stuck test must still clean up, or its open sockets keep this file from ever finishing.
const test = (name: string, run: () => Promise<void>) => nodeTest(name, { timeout: 20_000 }, run);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanUpOne of cleanups.splice(0)) cleanUpOne();
});

const url = (from = api) => `${from.url().replace(/^http/, 'ws')}/me/live`;
const bearer = (who: { token: string }) => ({ Authorization: `Bearer ${who.token}` });

/** A phone: its connection and everything it has heard (the "still alive" notes left out). */
const phone = async (who: { token: string }, from = api) => {
  const ws = new WebSocket(url(from), { headers: bearer(who) });
  cleanups.push(() => ws.terminate());
  const heard: Record<string, unknown>[] = [];
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.type !== 'alive') heard.push(message);
  });
  const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return { ws, heard, closed };
};

const refusedWith = (address: string, headers: Record<string, string> = {}) =>
  new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(address, { headers });
    cleanups.push(() => ws.terminate());
    ws.once('open', () => reject(new Error('It let them in')));
    ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => {});
  });

const send = (who: Person, chat: string, text: string) => api.call('POST', `/chats/${chat}/messages`, who, { text });
const threadOf = async (who: Person, chat: string) => {
  const list = await api.call('GET', '/chats', who);
  assert.equal(list.status, 200);
  return list.body.find((thread: { id: string }) => thread.id === chat);
};
const unread = async (who: Person, chat = chatId) => (await threadOf(who, chat)).unreadCount as number;
const read = (who: Person, chat: string, messageId: string) => api.call('POST', `/chats/${chat}/read`, who, { messageId });

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  seller = await newPerson(api, EMAILS[0]);
  buyer = await newPerson(api, EMAILS[1]);
  other = await newPerson(api, EMAILS[2]);
  rider = await newPerson(api, EMAILS[3], { role: 'courier' });
  support = await newPerson(api, EMAILS[4], { role: 'admin', adminRole: 'support' });
  await newListing(seller.id, LISTINGS[0]);
  await newListing(seller.id, LISTINGS[1]);
  chatId = (await api.call('POST', `/listings/${LISTINGS[0]}/offers`, buyer, { amountFils: 50_000 })).body.chatId;
  secondChatId = (await api.call('POST', `/listings/${LISTINGS[1]}/offers`, other, { amountFils: 50_000 })).body.chatId;
  live = attachLive(api.server, app);
  await until('the listener', () => live.stats().listening);
});
beforeEach(async () => {
  // Every test starts with both sides having read everything.
  const now = new Date();
  await prisma.chat.updateMany({ where: { id: { in: [chatId, secondChatId] } }, data: { buyerReadAt: now, sellerReadAt: now } });
  await sleep(5);
});
after(async () => {
  live.close();
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

// ── Who may connect ──

test('no token, a bad one, one that ended, or a dashboard token: refused', async () => {
  assert.equal(await refusedWith(url()), 401);
  assert.equal(await refusedWith(url(), { Authorization: 'Bearer nonsense' }), 401);
  assert.equal(await refusedWith(url(), { Authorization: buyer.token }), 401); // not "Bearer …"
  assert.equal(await refusedWith(url(), bearer(support)), 401); // an admin's token is for the dashboard

  const leaving = await newPerson(api, 'livechat.leaving@example.com');
  assert.equal((await api.call('POST', '/auth/logout', leaving)).status, 204);
  assert.equal(await refusedWith(url(), bearer(leaving)), 401);
  await prisma.user.deleteMany({ where: { email: 'livechat.leaving@example.com' } });
});

test('a token in the address doesn’t work: it would end up in logs', async () => {
  assert.equal(await refusedWith(`${url()}?token=${buyer.token}`), 401);
});

test('a suspended person is refused', async () => {
  const banned = await newPerson(api, 'livechat.banned@example.com');
  await prisma.user.update({ where: { id: banned.id }, data: { suspended: true } });
  assert.equal(await refusedWith(url(), bearer(banned)), 403);
  await prisma.user.deleteMany({ where: { email: 'livechat.banned@example.com' } });
});

test('another website can’t connect, even with a token', async () => {
  assert.equal(await refusedWith(url(), { ...bearer(buyer), Origin: 'https://evil.example.com' }), 403);
});

test('a driver can connect: they have support', async () => {
  (await phone(rider)).ws.close();
});

// ── What it says, and to whom ──

test('a message: both sides hear within a second, nobody else does', async () => {
  const [buyerPhone, sellerPhone, outsider] = await Promise.all([phone(buyer), phone(seller), phone(other)]);
  const started = performance.now();
  assert.equal((await send(buyer, chatId, 'Is it available?')).status, 201);
  await until('both phones', () => buyerPhone.heard.length === 1 && sellerPhone.heard.length === 1, 1000);
  assert.ok(performance.now() - started < 1000);
  await sleep(100);
  assert.equal(outsider.heard.length, 0, 'someone outside the chat heard about it');
});

test('it only says which chat: never the words, never who', async () => {
  const sellerPhone = await phone(seller);
  await send(buyer, chatId, 'my secret words');
  await until('the signal', () => sellerPhone.heard.length === 1);
  assert.deepEqual(sellerPhone.heard[0], { type: 'chat', chatId });
});

test('when the signal arrives, the message is already there to fetch', async () => {
  const sellerPhone = await phone(seller);
  const text = `there already ${Date.now()}`;
  await send(buyer, chatId, text);
  await until('the signal', () => sellerPhone.heard.length === 1);
  const messages = await api.call('GET', `/chats/${chatId}/messages`, seller);
  assert.equal(messages.body.at(-1).text, text);
});

test('the signal waits until the message is saved, and a message that fails is never announced', async () => {
  const sellerPhone = await phone(seller);
  await assert.rejects(
    prisma.$transaction(async tx => {
      await post(tx, chatId, buyer.id, 'this never gets saved');
      throw new Error('something went wrong');
    }),
    /something went wrong/,
  );
  await sleep(150);
  assert.equal(sellerPhone.heard.length, 0, 'announced a message that was never saved');

  let committed = false;
  await prisma.$transaction(async tx => {
    await post(tx, chatId, buyer.id, 'slow to save');
    await sleep(200);
    assert.equal(sellerPhone.heard.length, 0, 'announced before it was saved');
    committed = true;
  });
  assert.ok(committed);
  await until('the signal after saving', () => sellerPhone.heard.length === 1);
});

test('an offer’s answer is heard too', async () => {
  const buyerPhone = await phone(buyer);
  const opened = await api.call('GET', `/chats/${chatId}/messages`, seller);
  const offerId = opened.body.findLast((m: { offer?: { id: string } }) => m.offer)?.offer.id;
  assert.equal((await api.call('POST', `/offers/${offerId}/respond`, seller, { status: 'rejected' })).status, 200);
  await until('the signal', () => buyerPhone.heard.length === 1);
  assert.deepEqual(buyerPhone.heard[0], { type: 'chat', chatId });
  assert.equal(await unread(buyer), 1);
});

// ── It ends when the session does ──

test('log-out, a password reset, suspension, expiry: the connection closes, others stay', async () => {
  const quick = startApi();
  await quick.ready;
  const server = attachLive(quick.server, app, { heartbeatMs: 100 });
  cleanups.push(() => {
    server.close();
    quick.close();
    quick.server.closeAllConnections();
  });
  await until('the listener', () => server.stats().listening);

  const stays = await phone(seller, quick);
  const person = await newPerson(api, 'livechat.ending@example.com');
  const signIn = async () => {
    const r = await api.raw('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: person.email, password: 'longenough-1' }) });
    return { token: ((await r.json()) as { token: string }).token };
  };
  try {
    const loggedOut = await phone(person, quick);
    assert.equal((await api.call('POST', '/auth/logout', person)).status, 204);
    assert.equal(await loggedOut.closed, 4401);

    const session = await signIn();
    const reset = await phone(session, quick);
    await prisma.session.deleteMany({ where: { userId: person.id } }); // what a password reset and deletion do
    assert.equal(await reset.closed, 4401);

    const session2 = await signIn();
    const suspended = await phone(session2, quick);
    await prisma.user.update({ where: { id: person.id }, data: { suspended: true } });
    assert.equal(await suspended.closed, 4401);
    await prisma.user.update({ where: { id: person.id }, data: { suspended: false } });

    const session3 = await signIn();
    const expired = await phone(session3, quick);
    await prisma.session.updateMany({ where: { userId: person.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await expired.closed, 4401);

    assert.equal(stays.ws.readyState, WebSocket.OPEN, 'someone else’s connection closed too');
  } finally {
    await prisma.user.deleteMany({ where: { email: person.email } });
  }
});

test('more than 5 phones: the oldest goes, so one person can’t hold many', async () => {
  const phones = [];
  for (let i = 0; i < 5; i++) phones.push(await phone(buyer));
  const sixth = await phone(buyer);
  assert.equal(await phones[0].closed, 4408);
  for (const still of phones.slice(1)) assert.equal(still.ws.readyState, WebSocket.OPEN);
  assert.equal(sixth.ws.readyState, WebSocket.OPEN);
  // Nobody else is affected.
  const sellerPhone = await phone(seller);
  assert.equal(sellerPhone.ws.readyState, WebSocket.OPEN);
});

test('nobody can send anything on it', async () => {
  const talker = await phone(buyer);
  talker.ws.send('hello');
  assert.equal(await talker.closed, 1008);
});

test('database connection killed: phones are told, and signals flow again', async () => {
  const quick = startApi();
  await quick.ready;
  const server = attachLive(quick.server, app);
  cleanups.push(() => {
    server.close();
    quick.close();
    quick.server.closeAllConnections();
  });
  await until('the listener', () => server.stats().listening);
  const first = await phone(seller, quick);
  const pid = (server.listenerForTests() as unknown as { processID: number }).processID;
  await prisma.$executeRaw`SELECT pg_terminate_backend(${pid}::int)`;
  assert.equal(await first.closed, 1013);
  await until('listening again', () => server.stats().listening, 10_000);
  const again = await phone(seller, quick);
  await send(buyer, chatId, 'after the reconnection');
  await until('the signal', () => again.heard.length === 1);
});

// ── Unread counts ──

test('the other person’s messages count; my own don’t', async () => {
  assert.equal(await unread(seller), 0);
  await send(buyer, chatId, 'one');
  await send(buyer, chatId, 'two');
  await send(seller, chatId, 'an answer');
  assert.equal(await unread(seller), 2);
  assert.equal(await unread(buyer), 1);
});

test('reading up to a message clears what came before it, for me only', async () => {
  const first = await send(buyer, chatId, 'one');
  await sleep(5);
  const second = await send(buyer, chatId, 'two');
  await sleep(5);
  await send(buyer, chatId, 'three');
  await send(seller, chatId, 'from the seller');
  assert.equal(await unread(seller), 3);
  assert.equal(await unread(buyer), 1);

  assert.equal((await read(seller, chatId, second.body.id)).status, 204);
  assert.equal(await unread(seller), 1, 'a message after the marker is still unread');
  assert.equal(await unread(buyer), 1, 'the seller reading must not touch the buyer’s count');
  assert.ok(first.body.id);
});

test('reading never moves backward, whichever phone answers last', async () => {
  const first = await send(buyer, chatId, 'one');
  await sleep(5);
  const second = await send(buyer, chatId, 'two');
  await read(seller, chatId, second.body.id);
  assert.equal(await unread(seller), 0);
  assert.equal((await read(seller, chatId, first.body.id)).status, 204);
  assert.equal(await unread(seller), 0);
});

test('a chat with no marker yet: everything from the other person is unread', async () => {
  await prisma.chat.update({ where: { id: chatId }, data: { sellerReadAt: null } });
  const count = await prisma.message.count({ where: { chatId, senderId: buyer.id } });
  assert.ok(count > 0);
  assert.equal(await unread(seller), count);
});

test('my other phones hear that I read it; the other person learns nothing', async () => {
  const message = await send(buyer, chatId, 'read me');
  const [myOtherPhone, theirPhone] = await Promise.all([phone(seller), phone(buyer)]);
  assert.equal((await read(seller, chatId, message.body.id)).status, 204);
  await until('my other phone', () => myOtherPhone.heard.length === 1);
  assert.deepEqual(myOtherPhone.heard[0], { type: 'chat', chatId });
  await sleep(100);
  assert.equal(theirPhone.heard.length, 0, 'that’s a read receipt');
});

test('reading again changes nothing and tells nobody', async () => {
  const message = await send(buyer, chatId, 'once');
  await read(seller, chatId, message.body.id);
  const myPhone = await phone(seller);
  assert.equal((await read(seller, chatId, message.body.id)).status, 204);
  await sleep(100);
  assert.equal(myPhone.heard.length, 0);
});

test('only my own chats, and only that chat’s messages', async () => {
  const message = await send(buyer, chatId, 'private');
  const before = await unread(seller);
  assert.equal((await read(other, chatId, message.body.id)).status, 404); // they can't tell it exists
  assert.equal(await unread(seller), before);
  assert.equal((await read(seller, secondChatId, message.body.id)).status, 422); // a message of another chat
  assert.equal((await read(seller, chatId, 'no-such-message')).status, 422);
  assert.equal((await api.call('POST', `/chats/${chatId}/read`, seller, {})).status, 422);
  assert.equal((await api.call('POST', `/chats/${chatId}/read`, seller, { messageId: 'x'.repeat(65) })).status, 422);
  assert.equal((await api.call('POST', `/chats/${chatId}/read`, null, { messageId: message.body.id })).status, 401);
  assert.equal((await api.call('POST', `/chats/${chatId}/read`, rider, { messageId: message.body.id })).status, 403);
});

test('the list says my count and nothing about how far the other person has read', async () => {
  const thread = await threadOf(buyer, chatId);
  assert.equal(typeof thread.unreadCount, 'number');
  const text = JSON.stringify(thread);
  assert.ok(!/ReadAt/.test(text), text);
});

test('someone I blocked: their chat and its count are hidden', async () => {
  await send(other, secondChatId, 'hello');
  assert.equal(await unread(seller, secondChatId), 1);
  assert.equal((await api.call('POST', '/me/blocked', seller, { userId: other.id })).status < 300, true);
  try {
    assert.equal(await threadOf(seller, secondChatId), undefined);
  } finally {
    await api.call('DELETE', `/me/blocked/${other.id}`, seller);
  }
});

// ── Support ──

test('a support reply: that person hears at once, without the words', async () => {
  assert.equal((await api.call('POST', '/support/messages', buyer, { text: 'I need help' })).status, 201);
  const [theirPhone, outsider] = await Promise.all([phone(buyer), phone(other)]);
  const reply = await api.call('POST', `/admin/support/${buyer.id}/messages`, support, { text: 'how can we help' });
  assert.equal(reply.status, 201);
  await until('the signal', () => theirPhone.heard.length === 1, 1000);
  assert.deepEqual(theirPhone.heard[0], { type: 'support' });
  await sleep(100);
  assert.equal(outsider.heard.length, 0);
});

test('writing to support: my other phones hear', async () => {
  const otherPhone = await phone(rider);
  assert.equal((await api.call('POST', '/support/messages', rider, { text: 'from my first phone' })).status, 201);
  await until('the signal', () => otherPhone.heard.length === 1);
  assert.deepEqual(otherPhone.heard[0], { type: 'support' });
});
