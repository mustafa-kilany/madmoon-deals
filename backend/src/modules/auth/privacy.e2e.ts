// SECURITY_PLAN S1.3, S1.5, S1.9, S8.4: nobody can test which emails have accounts;
// a reset really signs out everywhere; a deleted account leaves no personal data in
// any table or on disk; a person can get a copy of their data.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { prisma } from '../../db';
import { env } from '../../env';
import { dataSeal } from '../../lib/sealed';
import { privateFilePath, privateStorage } from '../../lib/storage';
import { cleanUp, DELIVERY, newListing, newPerson, paidOrder, PASSWORD, PICKUP, startApi, type Person } from '../../lib/testkit';
import { fakePayments } from '../payments/fake';
import { flushJobs } from '../../lib/jobs';
import { uploadDir } from '../../lib/storage';
import { mailer } from './mailer';
import path from 'node:path';

const api = startApi();
const { call, raw } = api;
const EMAILS = ['priv.known@example.com', 'priv.google@example.com', 'priv.gone@example.com', 'priv.other@example.com', 'priv.money@example.com', 'priv.bid@example.com', 'priv.rider@sahla.jo', 'priv.admin@sahla.jo', 'priv.late@example.com'];
const LISTINGS = ['priv-sold', 'priv-live', 'priv-bought', 'priv-owed', 'priv-held', 'priv-auction', 'priv-copy', 'priv-late'];
let other: Person, rider: Person, admin: Person;

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  other = await newPerson(api, EMAILS[3]);
  rider = await newPerson(api, EMAILS[6], { role: 'courier' });
  admin = await newPerson(api, EMAILS[7], { role: 'admin', adminRole: 'owner' });
});
after(async () => {
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

/** Real codes and a mailbox instead of the test shortcut: what's sent, and how slowly. */
function liveEmail(delayMs = 0) {
  const real = mailer.send;
  const dev = env.DEV_EMAIL_CODE;
  const inbox: { to: string; subject: string; text: string }[] = [];
  (env as { DEV_EMAIL_CODE?: string }).DEV_EMAIL_CODE = undefined;
  mailer.send = async message => {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    inbox.push(message);
  };
  return { inbox, restore: () => { mailer.send = real; (env as { DEV_EMAIL_CODE?: string }).DEV_EMAIL_CODE = dev; } };
}
const ms = async (work: () => Promise<unknown>) => {
  const start = performance.now();
  await work();
  return performance.now() - start;
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const CODE = /\b\d{6}\b/;

test('S1.3 sign-up: an email with an account gets the same answer, and only its owner learns why', async () => {
  await newPerson(api, EMAILS[0]);
  const mail = liveEmail();
  try {
    const known = await call('POST', '/auth/send-otp', null, { email: EMAILS[0] });
    const fresh = await call('POST', '/auth/send-otp', null, { email: 'priv.fresh@example.com' });
    assert.deepEqual([known.status, known.body], [204, undefined]);
    assert.deepEqual([fresh.status, fresh.body], [204, undefined]);

    const [toKnown] = mail.inbox.filter(m => m.to === EMAILS[0]);
    const [toFresh] = mail.inbox.filter(m => m.to === 'priv.fresh@example.com');
    assert.match(toKnown.text, /already have/);
    assert.ok(!CODE.test(toKnown.text), 'no usable code for an existing account');
    assert.match(toFresh.text, CODE);

    // A wrong code gets the same answer for both, so sign-up reveals nothing either.
    const attempt = (email: string) => call('POST', '/auth/signup', null, { name: 'Tester', email, password: 'a-long-enough-one', acceptTerms: true, code: '000000' });
    const [a, b] = await Promise.all([attempt(EMAILS[0]), attempt('priv.fresh@example.com')]);
    assert.deepEqual([a.status, a.body], [b.status, b.body]);
    assert.equal(a.body.error.code, 'INVALID_CODE');

    // The new person's real code works, and is used up.
    const real = toFresh.text.match(CODE)![0];
    const made = await call('POST', '/auth/signup', null, { name: 'Fresh', email: 'priv.fresh@example.com', password: 'a-long-enough-one', acceptTerms: true, code: real });
    assert.equal(made.status, 201);
  } finally {
    mail.restore();
    await prisma.user.deleteMany({ where: { email: 'priv.fresh@example.com' } });
  }
});

test('S1.3 forgot password: at once whether or not the account exists, even with slow email', async () => {
  const mail = liveEmail(400);
  try {
    const known = await ms(() => call('POST', '/auth/forgot-password', null, { email: EMAILS[0] }));
    const unknown = await ms(() => call('POST', '/auth/forgot-password', null, { email: 'priv.nobody@example.com' }));
    assert.ok(known < 200, `known took ${known} ms: it waited for the email`);
    assert.ok(unknown < 200, `unknown took ${unknown} ms`);
    await flushJobs();
    assert.equal(mail.inbox.filter(m => m.to === EMAILS[0]).length, 1, 'the real account still gets its code');
    assert.equal(mail.inbox.filter(m => m.to === 'priv.nobody@example.com').length, 0);
  } finally {
    mail.restore();
  }
});

test('S1.3 log-in: the same words and similar time for no account, a wrong password and a Google account', async () => {
  const google = await newPerson(api, EMAILS[1]);
  await prisma.user.update({ where: { id: google.id }, data: { passwordHash: null, method: 'google' } });
  const login = (email: string) => call('POST', '/auth/login', null, { email, password: 'not-the-password' });
  const answers = await Promise.all([login(EMAILS[0]), login(EMAILS[1]), login('priv.nobody@example.com')]);
  for (const a of answers) assert.deepEqual([a.status, a.body], [401, answers[0].body]);

  const times = async (email: string) => {
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) runs.push(await ms(() => login(email)));
    return median(runs);
  };
  const [password, social, none] = [await times(EMAILS[0]), await times(EMAILS[1]), await times('priv.nobody@example.com')];
  // scrypt takes tens of milliseconds: all three do it, so none is far off the others.
  assert.ok(Math.max(password, social, none) < Math.min(password, social, none) * 3, `${password} ${social} ${none}`);
});

test('S1.5 a password reset ends every session; only the new one works', async () => {
  const email = EMAILS[0];
  const one = await newPerson(api, email);
  const logIn = async () => (await call('POST', '/auth/login', null, { email, password: PASSWORD })).body.token as string;
  const two = await logIn();
  await prisma.device.create({ data: { token: 'priv-known-phone-token-001', userId: one.id, platform: 'android' } });
  await prisma.device.updateMany({ where: { token: 'priv-known-phone-token-001' }, data: { sessionId: (await prisma.session.findFirstOrThrow({ where: { userId: one.id } })).id } });

  const reset = await call('POST', '/auth/reset-password', null, { email, password: 'a-brand-new-password', code: env.DEV_EMAIL_CODE });
  assert.equal(reset.status, 200);
  assert.equal((await call('GET', '/me', { token: one.token })).status, 401);
  assert.equal((await call('GET', '/me', { token: two })).status, 401);
  assert.equal((await call('GET', '/me', { token: reset.body.token })).status, 200);
  assert.equal((await call('POST', '/auth/login', null, { email, password: PASSWORD })).status, 401);
  assert.equal(await prisma.device.count({ where: { token: 'priv-known-phone-token-001' } }), 0, 'that phone stops getting pushes');
});

/** Everything in the database about anything, as one string, to look for leftovers. */
async function everyTable() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const dump: Record<string, unknown[]> = {};
  for (const { tablename } of tables) dump[tablename] = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`);
  return dump;
}

const jpeg = () => sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 60, b: 200 } } }).jpeg().toBuffer();
const uploadPhoto = async (who: Person) => {
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(await jpeg())], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await raw('/uploads/listing-photo', { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: form });
  return ((await r.json()) as { url: string }).url;
};

test('S1.9 a deleted account leaves no personal data in any table or on disk', async () => {
  const MARKS = { name: 'Zainab Unique-Name', phone: '0790000111', address: 'Zainab Street 77', pickup: '0795555444', iban: 'JO94CBJO0010000000000131000302', note: 'zainab-note-text', chat: 'zainab-chat-text', support: 'zainab-support-text', report: 'zainab-report-text' };
  const gone = await newPerson(api, EMAILS[2], { name: MARKS.name, payoutHolder: MARKS.name, payoutIban: dataSeal(MARKS.iban), payoutIbanLast4: '0302', cardToken: 'fakecard_visa_4242', cardBrand: 'visa', cardLast4: '4242', avatarUrl: '/files/avatars/priv-gone.jpg' });
  const deleted: string[] = [];
  const realDelete = fakePayments.deleteCard;
  fakePayments.deleteCard = async token => void deleted.push(token);

  // They sold something that was delivered, have something on sale, and bought something.
  await newListing(gone.id, 'priv-sold', { pickupPhone: MARKS.pickup, pickupAddress: MARKS.address, description: `A sofa from ${MARKS.name}, in good condition and easy to take apart for moving.` });
  const sold = await paidOrder(api, other, 'priv-sold');
  await prisma.order.update({ where: { id: sold.id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  assert.equal((await call('POST', '/courier/confirm-delivery', rider, { orderId: sold.id, pin: sold.pin })).status, 200);
  await prisma.payout.update({ where: { orderId: sold.id }, data: { status: 'paid', paidAt: new Date() } });

  const photo = await uploadPhoto(gone);
  const photoFile = path.join(uploadDir, new URL(photo).pathname.replace('/files/', ''));
  assert.ok(existsSync(photoFile));
  await newListing(gone.id, 'priv-live', { imageUrls: [new URL(photo).pathname], pickupPhone: MARKS.pickup, pickupAddress: MARKS.address });
  const original = await privateStorage.put('certificates/priv-gone.jpg', Buffer.from('original with an IMEI'));
  await prisma.testCertificate.create({ data: { userId: gone.id, status: 'passed', category: 'mobiles', type: 'phones', brand: 'Apple', photoUrl: original, ocrProvider: 'fake', ocrText: 'IMEI 356938035643809', specs: [] } });

  await newListing(other.id, 'priv-bought');
  const bought = await call('POST', '/orders', gone, { listingId: 'priv-bought', delivery: { ...DELIVERY, name: MARKS.name, phone: MARKS.phone, address: MARKS.address, notes: MARKS.note } });
  const paid = await call('POST', `/orders/${bought.body.id}/pay`, gone, { cardToken: 'saved' });
  await prisma.order.update({ where: { id: paid.body.id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  assert.equal((await call('POST', '/courier/confirm-delivery', rider, { orderId: paid.body.id, pin: paid.body.pin })).status, 200);

  // They talked, reported and wrote to support, and someone else reported them.
  const offer = await call('POST', '/listings/priv-live/offers', other, { amountFils: 50_000 });
  await call('POST', `/chats/${offer.body.chatId}/messages`, gone, { text: MARKS.chat });
  await call('POST', '/reports', gone, { targetType: 'listing', targetId: 'priv-bought', reason: 'other', details: MARKS.report });
  await call('POST', '/reports', other, { targetType: 'user', targetId: gone.id, reason: 'other', details: MARKS.report });
  await call('POST', '/support/messages', gone, { text: MARKS.support });
  await call('POST', '/me/blocked', gone, { userId: admin.id });

  const before = JSON.stringify(await everyTable());
  for (const mark of [MARKS.name, MARKS.phone, MARKS.pickup, MARKS.chat, MARKS.support, MARKS.report, gone.id])
    assert.ok(before.includes(mark), `the test should have planted ${mark}`);

  assert.equal((await call('DELETE', '/me', gone)).status, 204);

  const dump = await everyTable();
  const { AdminAction: _audit, ...rest } = dump as { AdminAction: unknown[] };
  const after = JSON.stringify(rest);
  for (const mark of [...Object.values(MARKS), EMAILS[2], gone.id, 'IMEI 356938035643809', 'fakecard_visa_4242']) {
    if (!after.includes(mark)) continue;
    const where = Object.entries(rest).filter(([, rows]) => JSON.stringify(rows).includes(mark)).map(([table]) => table);
    assert.fail(`"${mark}" is still in ${where.join(', ')}`);
  }
  assert.ok(!existsSync(photoFile), 'the listing photo file is gone');
  assert.ok(!existsSync(privateFilePath(original)!), 'the certificate original is gone');
  assert.deepEqual(deleted, ['fakecard_visa_4242'], 'the saved card is forgotten at the provider');
  fakePayments.deleteCard = realDelete;

  // The accounts survive: the amounts of both finished orders, and the buyer can still see theirs.
  const rows = await prisma.order.findMany({ where: { listingId: { in: ['priv-sold', 'priv-bought'] } } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(o => o.totalFils > 0));
  assert.equal((await call('GET', `/orders/${sold.id}`, other)).status, 200);
  assert.equal(await prisma.listing.count({ where: { id: 'priv-live' } }), 0, 'a listing nobody ordered goes completely');
  assert.equal((await call('GET', '/listings/priv-sold')).body.description ?? '', '');
});

test('H3 an unpaid checkout with a payment record stays, without who or where, when the account goes', async () => {
  const late = await newPerson(api, EMAILS[8]);
  await newListing(other.id, 'priv-late');
  const checkout = await call('POST', '/orders', late, { listingId: 'priv-late', delivery: DELIVERY });
  assert.equal(checkout.status, 201);
  // A card check that charged after someone else bought it, refunded since: money moved, so it is a record.
  await prisma.payment.create({ data: { orderId: checkout.body.id, provider: 'fake', providerRef: 'priv-late-ref', amountFils: checkout.body.totalFils, status: 'refunded' } });
  assert.equal((await call('DELETE', '/me', late)).status, 204);
  const kept = await prisma.order.findUniqueOrThrow({ where: { id: checkout.body.id }, include: { payments: true } });
  assert.equal(kept.payments.length, 1);
  assert.equal(kept.buyerId, null);
  assert.deepEqual([kept.deliveryName, kept.deliveryPhone, kept.deliveryAddress], ['', '', '']);
});

test('S1.9 not while money is owed, an auction is live, or for staff', async () => {
  const person = await newPerson(api, EMAILS[4]);
  const code = async () => (await call('DELETE', '/me', person)).body?.error?.code;

  // Delivered, but the seller hasn't been paid yet.
  await newListing(person.id, 'priv-owed');
  const order = await paidOrder(api, other, 'priv-owed');
  await prisma.order.update({ where: { id: order.id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  await call('POST', '/courier/confirm-delivery', rider, { orderId: order.id, pin: order.pin });
  assert.equal(await code(), 'OPEN_ORDERS');
  await prisma.payout.update({ where: { orderId: order.id }, data: { status: 'paid' } });

  // A seller's listing with a buyer in the bank's card check at this moment.
  await newListing(person.id, 'priv-held');
  const checkout = await call('POST', '/orders', other, { listingId: 'priv-held', delivery: DELIVERY });
  await call('POST', `/orders/${checkout.body.id}/pay`, other, { cardToken: 'mock_visa_3155' });
  assert.equal(await code(), 'OPEN_ORDERS');
  await prisma.payment.updateMany({ where: { orderId: checkout.body.id }, data: { status: 'failed' } });

  // The highest bidder on a live auction.
  const bidder = await newPerson(api, EMAILS[5]);
  await newListing(other.id, 'priv-auction', { saleType: 'auction', auctionEndsAt: new Date(Date.now() + 3_600_000), incrementFils: 1000 });
  assert.equal((await call('POST', '/listings/priv-auction/bids', bidder, { amountFils: 100_000 })).status, 201);
  assert.equal((await call('DELETE', '/me', bidder)).body.error.code, 'OPEN_ORDERS');

  // The seller of that auction, now it has a bid.
  assert.equal((await call('DELETE', '/me', other)).body.error.code, 'OPEN_ORDERS');

  // Staff are closed by an admin.
  const r = await call('DELETE', '/me', rider);
  assert.deepEqual([r.status, r.body.error.code], [403, 'FORBIDDEN']);
  assert.equal(await prisma.user.count({ where: { id: rider.id } }), 1);

  assert.equal((await call('DELETE', '/me', person)).status, 204, 'with nothing open it goes');
});

test('S8.4 a person can download a copy of their data, with no secrets in it', async () => {
  const person = await newPerson(api, EMAILS[4], { payoutHolder: 'Copy Person', payoutIban: dataSeal('JO94CBJO0010000000000131000302'), payoutIbanLast4: '0302', cardToken: 'fakecard_visa_4242', cardBrand: 'visa', cardLast4: '4242' });
  await newListing(person.id, 'priv-copy');
  const order = await paidOrder(api, other, 'priv-copy');
  const copy = await call('GET', '/me/export', person);
  assert.equal(copy.status, 200);
  assert.equal(copy.headers.get('cache-control'), 'no-store');
  assert.equal(copy.body.profile.email, EMAILS[4]);
  assert.equal(copy.body.profile.bankAccount.ibanLast4, '0302');
  assert.equal(copy.body.listings[0].pickup.phone, PICKUP.phone, 'their own pickup');
  assert.equal(copy.body.sales[0].id, order.id);
  const text = JSON.stringify(copy.body);
  for (const secret of ['passwordHash', 'scrypt$', 'fakecard_', 'JO94CBJO', 'totpSecret', 'tokenHash', 'nationalIdHash', '"pin"', order.pin === '0000' ? 'never' : `"${order.pin}"`, DELIVERY.phone, DELIVERY.address])
    assert.ok(!text.includes(secret), `the copy contains ${secret}`);
  assert.equal((await call('GET', '/me/export')).status, 401);
});
