// Chats and offers (BACKEND_PLAN B6.1, B6.2): the offer flow and turn rules in
// docs/API.md, the messages each step posts, paging, and blocks.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['offer.seller@example.com', 'offer.buyer@example.com', 'offer.other@example.com'];
const people: { id: string; token: string }[] = [];
const [seller, buyer, other] = [0, 1, 2].map(i => () => people[i]);
const LISTINGS = ['offer-sofa', 'offer-lamp', 'offer-auction'];

const call = async (method: string, path: string, who: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${who.token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};
const offer = (listing: string, amountFils: number, who = buyer()) => call('POST', `/listings/${listing}/offers`, who, { amountFils });
const respond = (id: string, who: { token: string }, status: string, counterAmountFils?: number) =>
  call('POST', `/offers/${id}/respond`, who, { status, counterAmountFils });
const messages = async (chatId: string, who = buyer()) => (await call('GET', `/chats/${chatId}/messages`, who)).body;

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const email of EMAILS) {
    const r = await fetch(`${base}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: email.split('.')[1].split('@')[0], email, password: 'longenough', acceptTerms: true, code: '123456' }),
    });
    const { token, user } = await r.json();
    people.push({ id: user.id, token });
  }
  const common = {
    category: 'furniture', type: 'sofas', imageUrls: ['https://images.example.com/sofa.jpg'], condition: 'good' as const,
    locationId: 'amman-khalda', description: 'A comfortable three seat sofa in grey fabric, clean and from a smoke free home.',
    sellerUserId: people[0].id,
  };
  await prisma.listing.createMany({
    data: [
      { ...common, id: LISTINGS[0], titleAr: 'كنبة', titleEn: 'Sofa', priceFils: 200_000 },
      { ...common, id: LISTINGS[1], titleAr: 'ضوء', titleEn: 'Lamp', priceFils: 20_000 },
      { ...common, id: LISTINGS[2], titleAr: 'مزاد', titleEn: 'Auction', priceFils: 20_000, saleType: 'auction', auctionEndsAt: new Date(Date.now() + 86_400_000), incrementFils: 1000 },
    ],
  });
});
after(async () => {
  server.close();
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('offer → counter → accept at the counter price; every step is a message in one chat', async () => {
  const made = await offer(LISTINGS[0], 150_000);
  assert.equal(made.status, 201);
  const { offer: o, chatId } = made.body;
  assert.deepEqual(
    [o.status, o.amountFils, o.itemId, o.buyerName, o.sellerId, o.sellerName, o.itemTitle.en],
    ['pending', 150_000, LISTINGS[0], 'buyer', seller().id, 'seller', 'Sofa'],
  );

  // Turns: the buyer can't answer their own pending offer; a stranger can't see it.
  assert.equal((await respond(o.id, buyer(), 'accepted')).status, 403);
  assert.equal((await call('GET', `/offers/${o.id}`, other())).status, 403);
  assert.equal((await respond(o.id, seller(), 'countered', 140_000)).status, 422); // must be above the offer

  const countered = await respond(o.id, seller(), 'countered', 180_000);
  assert.deepEqual([countered.body.status, countered.body.counterAmountFils], ['countered', 180_000]);
  assert.equal((await respond(o.id, seller(), 'accepted')).status, 403); // now it's the buyer's turn
  assert.equal((await respond(o.id, buyer(), 'countered', 170_000)).status, 422); // make a new offer instead

  const accepted = await respond(o.id, buyer(), 'accepted');
  assert.deepEqual([accepted.body.status, accepted.body.amountFils], ['accepted', 180_000]);
  assert.equal((await respond(o.id, seller(), 'rejected')).status, 422); // finished
  assert.equal((await call('GET', `/offers/${o.id}`, seller())).body.status, 'accepted');

  const chat = await messages(chatId);
  assert.deepEqual(
    chat.map((m: { text: string; senderId: string }) => [m.text, m.senderId]),
    [
      ['Made an offer of 150 JOD', buyer().id],
      ['Counter offer: 180 JOD', seller().id],
      ['Accepted 180 JOD', buyer().id],
    ],
  );
  // Every message shows the offer as it is now.
  assert.ok(chat.every((m: { offer: { status: string } }) => m.offer.status === 'accepted'));

  // The same chat on both sides, each seeing the other person.
  const [mine] = (await call('GET', '/chats', buyer())).body;
  const [theirs] = (await call('GET', '/chats', seller())).body;
  assert.deepEqual([mine.id, mine.otherPartyId, mine.otherPartyName, mine.lastMessage], [chatId, seller().id, 'seller', 'Accepted 180 JOD']);
  assert.deepEqual([theirs.id, theirs.otherPartyId, theirs.otherPartyName], [chatId, buyer().id, 'buyer']);
  assert.deepEqual((await call('GET', '/chats', other())).body, []);
  assert.equal((await call('GET', `/chats/${chatId}/messages`, other())).status, 404);

  // A new offer goes in the same chat.
  const again = await offer(LISTINGS[0], 160_000);
  assert.equal(again.body.chatId, chatId);
});

test('one open offer at a time; reject, then offer again', async () => {
  const { body } = await offer(LISTINGS[1], 10_000);
  assert.equal((await offer(LISTINGS[1], 12_000)).status, 422);
  assert.equal((await respond(body.offer.id, seller(), 'rejected')).body.status, 'rejected');
  assert.equal((await offer(LISTINGS[1], 12_000)).status, 201);
});

test('who can offer on what', async () => {
  assert.equal((await offer(LISTINGS[1], 5000, seller())).status, 403); // your own listing
  assert.deepEqual([(await offer(LISTINGS[2], 5000)).status], [409]); // auctions take bids
  assert.equal((await offer('nope', 5000)).status, 404);
  assert.equal((await offer(LISTINGS[1], 0)).status, 422);
  await prisma.listing.update({ where: { id: LISTINGS[1] }, data: { status: 'reserved' } });
  const reserved = await offer(LISTINGS[1], 5000, other());
  assert.deepEqual([reserved.status, reserved.body.error.code], [409, 'ITEM_UNAVAILABLE']);
  await prisma.listing.update({ where: { id: LISTINGS[1] }, data: { status: 'active' } });
});

test('messages: both sides write, oldest first, paging back with before', async () => {
  const { chatId } = (await offer(LISTINGS[1], 1000, other())).body;
  for (let i = 1; i <= 3; i++) assert.equal((await call('POST', `/chats/${chatId}/messages`, other(), { text: `  hello ${i}  ` })).status, 201);
  const reply = await call('POST', `/chats/${chatId}/messages`, seller(), { text: 'Still available' });
  assert.deepEqual([reply.body.text, reply.body.senderName, reply.body.offer], ['Still available', 'seller', undefined]);
  assert.equal((await call('POST', `/chats/${chatId}/messages`, other(), { text: '   ' })).status, 422);
  assert.equal((await call('POST', `/chats/${chatId}/messages`, other(), { text: 'x'.repeat(1001) })).status, 422);
  assert.equal((await call('POST', `/chats/${chatId}/messages`, buyer(), { text: 'hi' })).status, 404);

  const all = await messages(chatId, other());
  assert.deepEqual(all.map((m: { text: string }) => m.text).slice(1), ['hello 1', 'hello 2', 'hello 3', 'Still available']);
  const older = (await call('GET', `/chats/${chatId}/messages?before=${all[3].id}&limit=2`, other())).body;
  assert.deepEqual(older.map((m: { text: string }) => m.text), ['hello 1', 'hello 2']);
});

test('a block hides the chat both ways and stops messages and offers', async () => {
  const { id: chatId } = (await call('GET', '/chats', buyer())).body[0];
  assert.ok(chatId);
  assert.equal((await call('POST', '/me/blocked', seller(), { userId: buyer().id })).status, 204);
  assert.ok(!(await call('GET', '/chats', buyer())).body.some((c: { id: string }) => c.id === chatId));
  assert.ok(!(await call('GET', '/chats', seller())).body.some((c: { id: string }) => c.id === chatId));
  assert.equal((await call('POST', `/chats/${chatId}/messages`, buyer(), { text: 'hello?' })).status, 403);
  assert.equal((await call('POST', `/chats/${chatId}/messages`, seller(), { text: 'bye' })).status, 403);
  assert.equal((await offer(LISTINGS[1], 3000)).status, 409);
  await call('DELETE', `/me/blocked/${buyer().id}`, seller());
  assert.ok((await call('GET', '/chats', buyer())).body.some((c: { id: string }) => c.id === chatId));
});
