// The notification inbox (BACKEND_REVIEW M2): every push is also kept, so a person whose push never
// arrived (notifications off, a new phone, no phone registered) still finds out in the app.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../../db';
import { env } from '../../env';
import { flushJobs } from '../../lib/jobs';
import { cleanUp, newListing, newPerson, startApi, type Person } from '../../lib/testkit';
import { pushChatMessage, pushPayoutAccountChanged } from './notify';
import { fakePushes } from './push';

const api = startApi();
const EMAILS = ['inbox.me@example.com', 'inbox.other@example.com'];
const LISTINGS = ['inbox-chat'];
let me: Person, other: Person;
const settings = env as { PUSH_MODE: string };

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  me = await newPerson(api, EMAILS[0]);
  other = await newPerson(api, EMAILS[1]);
});
after(async () => {
  settings.PUSH_MODE = 'fake';
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

const inbox = async (who: Person, lang = 'en') => (await api.call('GET', `/me/notifications?lang=${lang}`, who)).body as {
  unreadCount: number;
  items: { type: string; refId: string | null; title: string; body: string; read: boolean }[];
};

test('a push is kept in the inbox, in both languages, even with no phone registered', async () => {
  pushPayoutAccountChanged(me.id, '0302');
  await flushJobs();
  fakePushes.sent.splice(0);
  const en = await inbox(me);
  assert.equal(en.unreadCount, 1);
  assert.equal(en.items[0].title, 'Bank account');
  assert.match(en.items[0].body, /ends in 0302/);
  assert.deepEqual([en.items[0].type, en.items[0].read], ['sale', false]);
  const ar = await inbox(me, 'ar');
  assert.equal(ar.items[0].title, 'الحساب البنكي');
});

test('pushes switched off: the inbox still gets it', async () => {
  settings.PUSH_MODE = 'off';
  try {
    pushPayoutAccountChanged(me.id, '1111');
    await flushJobs();
  } finally {
    settings.PUSH_MODE = 'fake';
  }
  const list = await inbox(me);
  assert.equal(list.unreadCount, 2);
  assert.match(list.items[0].body, /1111/, 'newest first');
});

test('the same push sent again by a retried job is kept once', async () => {
  const before = (await inbox(me)).items.length;
  pushPayoutAccountChanged(me.id, '1111');
  await flushJobs();
  assert.equal((await inbox(me)).items.length, before);
});

test('chat messages are not copied: the chat list counts them', async () => {
  await newListing(other.id, 'inbox-chat');
  const chatId = (await api.call('POST', '/listings/inbox-chat/offers', me, { amountFils: 5000 })).body.chatId as string;
  const before = (await inbox(other)).items.length;
  pushChatMessage(chatId, me.id);
  await flushJobs();
  assert.equal((await inbox(other)).items.filter(n => n.type === 'chat').length, 0);
  assert.ok((await inbox(other)).items.length >= before);
});

test('each person sees only their own; reading clears my dot, not theirs', async () => {
  pushPayoutAccountChanged(other.id, '2222');
  await flushJobs();
  const mine = await inbox(me);
  assert.ok(mine.items.every(n => !/2222/.test(n.body)), 'saw someone else’s');
  assert.equal((await api.call('POST', '/me/notifications/read', me)).status, 204);
  const after = await inbox(me);
  assert.equal(after.unreadCount, 0);
  assert.ok(after.items.every(n => n.read));
  assert.ok((await inbox(other)).unreadCount >= 1);
});

test('signed in only', async () => {
  assert.equal((await api.call('GET', '/me/notifications')).status, 401);
  assert.equal((await api.call('POST', '/me/notifications/read')).status, 401);
});
