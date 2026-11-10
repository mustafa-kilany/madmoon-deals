// SECURITY_PLAN S8.3: old personal data goes; recent data and the accounts stay.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { prisma } from '../../db';
import { privateFilePath, privateStorage, storage, uploadDir } from '../../lib/storage';
import { cleanUp, DELIVERY, newListing, newPerson, paidOrder, startApi, type Person } from '../../lib/testkit';
import { KEEP_DAYS, runRetention } from './retention';

const api = startApi();
const EMAILS = ['keep.seller@example.com', 'keep.buyer@example.com'];
const LISTINGS = ['keep-old', 'keep-new', 'keep-unpaid', 'keep-gone', 'keep-photo', 'keep-chat-old', 'keep-chat-live', 'keep-cert', 'keep-never-paid'];
let seller: Person, buyer: Person;
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  seller = await newPerson(api, EMAILS[0]);
  buyer = await newPerson(api, EMAILS[1]);
});
after(async () => {
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

test('an ended order loses its phones and addresses after 90 days; a recent or open one keeps them', async () => {
  await newListing(seller.id, 'keep-old');
  const old = await paidOrder(api, buyer, 'keep-old');
  await prisma.order.update({ where: { id: old.id }, data: { status: 'completed', deliveredAt: daysAgo(KEEP_DAYS.orderContact + 1) } });
  await newListing(seller.id, 'keep-new');
  const fresh = await paidOrder(api, buyer, 'keep-new');
  await prisma.order.update({ where: { id: fresh.id }, data: { status: 'completed', deliveredAt: daysAgo(KEEP_DAYS.orderContact - 1) } });

  await runRetention();
  const wiped = await prisma.order.findUniqueOrThrow({ where: { id: old.id } });
  assert.deepEqual([wiped.deliveryPhone, wiped.deliveryAddress, wiped.deliveryNotes, wiped.pickupPhone, wiped.pickupAddress], ['', '', null, null, null]);
  assert.equal(wiped.deliveryName, DELIVERY.name, 'the name and amounts stay for the records');
  assert.ok(wiped.totalFils > 0);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: fresh.id } })).deliveryPhone, DELIVERY.phone);
  // The buyer can still open it.
  assert.equal((await api.call('GET', `/orders/${old.id}`, buyer)).status, 200);
});

test('an abandoned checkout goes after 30 days, unless it has any payment record (H3)', async () => {
  await newListing(seller.id, 'keep-unpaid');
  const checkout = await api.call('POST', '/orders', buyer, { listingId: 'keep-unpaid', delivery: DELIVERY });
  const id = checkout.body.id as string;
  await prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${daysAgo(KEEP_DAYS.unpaidCheckout + 1)} WHERE "id" = ${id}`;
  // A late payment that was charged, then refunded: the order never got paid, but money moved.
  const payment = await prisma.payment.create({ data: { orderId: id, provider: 'fake', providerRef: `keep-${id}`, amountFils: 1, status: 'pending' } });
  for (const status of ['pending', 'refunded', 'failed'] as const) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status } });
    await runRetention();
    assert.equal(await prisma.order.count({ where: { id } }), 1, `deleted with a ${status} payment`);
    assert.equal(await prisma.payment.count({ where: { id: payment.id } }), 1);
  }

  // No payment at all: nobody's record, it goes.
  await newListing(seller.id, 'keep-never-paid');
  const never = (await api.call('POST', '/orders', buyer, { listingId: 'keep-never-paid', delivery: DELIVERY })).body.id as string;
  await prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${daysAgo(KEEP_DAYS.unpaidCheckout + 1)} WHERE "id" = ${never}`;
  await runRetention();
  assert.equal(await prisma.order.count({ where: { id: never } }), 0);
});

test('the database itself refuses to delete an order that has payment or payout records (H3)', async () => {
  const order = await prisma.order.findFirstOrThrow({ where: { listingId: 'keep-unpaid' } });
  await assert.rejects(prisma.order.delete({ where: { id: order.id } }));
  assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);
  const delivered = await prisma.order.findFirstOrThrow({ where: { listingId: 'keep-old' } });
  await prisma.payment.deleteMany({ where: { orderId: delivered.id } });
  await prisma.payout.create({ data: { orderId: delivered.id, sellerUserId: seller.id, amountFils: 1 } });
  await assert.rejects(prisma.order.delete({ where: { id: delivered.id } }));
});

test('certificate originals: gone 180 days after the listing ends, or 30 if unused; live ones stay', async () => {
  const put = (name: string) => privateStorage.put(`certificates/keep-${name}.jpg`, Buffer.from('IMEI 356938035643809'));
  const row = (photoUrl: string, extra = {}) =>
    prisma.testCertificate.create({ data: { userId: seller.id, status: 'passed', category: 'mobiles', type: 'phones', brand: 'Apple', photoUrl, ocrProvider: 'fake', ocrText: 'IMEI 356938035643809', shopPhone: '0790000000', specs: [], ...extra } });

  const blurred = await storage.put('certificates/keep-unused_blurred.jpg', Buffer.from('blurred'));
  const [unusedPhoto, recentPhoto, livePhoto, endedPhoto] = await Promise.all(['unused', 'recent', 'live', 'ended'].map(put));
  const unused = await row(unusedPhoto, { createdAt: daysAgo(KEEP_DAYS.unusedCertificate + 1), blurredUrl: blurred });
  const recent = await row(recentPhoto);
  const live = await row(livePhoto, { createdAt: daysAgo(500) });
  const ended = await row(endedPhoto, { createdAt: daysAgo(500) });
  await newListing(seller.id, 'keep-cert', { testCertificateId: live.id });
  await newListing(seller.id, 'keep-gone', { testCertificateId: ended.id, status: 'sold' });
  await prisma.$executeRaw`UPDATE "Listing" SET "updatedAt" = ${daysAgo(KEEP_DAYS.certificateOriginal + 1)} WHERE "id" = 'keep-gone'`;

  await runRetention();
  const after = async (id: string) => prisma.testCertificate.findUniqueOrThrow({ where: { id } });
  for (const [certificate, photo] of [[unused, unusedPhoto], [ended, endedPhoto]] as const) {
    const now = await after(certificate.id);
    assert.deepEqual([now.photoUrl, now.ocrText, now.shopPhone], ['', '', null]);
    assert.ok(!existsSync(privateFilePath(photo)!), 'the original file is gone');
  }
  assert.equal((await after(unused.id)).blurredUrl, null);
  assert.ok(!existsSync(path.join(uploadDir, 'certificates/keep-unused_blurred.jpg')));
  for (const [certificate, photo] of [[recent, recentPhoto], [live, livePhoto]] as const) {
    assert.equal((await after(certificate.id)).photoUrl, photo);
    assert.ok(existsSync(privateFilePath(photo)!));
    await privateStorage.remove(photo);
  }
  await prisma.listing.deleteMany({ where: { id: { in: ['keep-cert', 'keep-gone'] } } });
  await prisma.testCertificate.deleteMany({ where: { userId: seller.id } });
});

test('a withdrawn listing’s photos go after 180 days; one on sale keeps them', async () => {
  const url = await storage.put('listings/keep-photo.jpg', Buffer.from('photo'));
  const thumb = await storage.put('listings/keep-photo_400.jpg', Buffer.from('thumb'));
  await prisma.upload.create({ data: { userId: seller.id, kind: 'listing', url, thumbUrl: thumb, bytes: 5, usedAt: new Date() } });
  await newListing(seller.id, 'keep-photo', { status: 'withdrawn', imageUrls: [url] });
  await prisma.$executeRaw`UPDATE "Listing" SET "updatedAt" = ${daysAgo(KEEP_DAYS.withdrawnPhotos + 1)} WHERE "id" = 'keep-photo'`;
  await runRetention();
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: 'keep-photo' } });
  assert.deepEqual([listing.imageUrls, listing.pickupPhone], [[], null]);
  for (const file of ['keep-photo.jpg', 'keep-photo_400.jpg']) assert.ok(!existsSync(path.join(uploadDir, 'listings', file)), file);
  assert.equal(await prisma.upload.count({ where: { url } }), 0);
});

test('old chats on finished items, support chats, sessions, codes, signals and views go', async () => {
  const chatOn = async (id: string, status: 'sold' | 'active') => {
    await newListing(seller.id, id, { status });
    return prisma.chat.create({ data: { listingId: id, buyerId: buyer.id, updatedAt: daysAgo(KEEP_DAYS.chat + 1) } });
  };
  const oldChat = await chatOn('keep-chat-old', 'sold');
  const liveChat = await chatOn('keep-chat-live', 'active');
  const thread = await prisma.supportThread.create({ data: { userId: buyer.id, lastMessageAt: daysAgo(KEEP_DAYS.support + 1) } });
  const session = await prisma.session.create({ data: { id: 'keep-old-session', userId: buyer.id, tokenHash: 'keep-old-session', expiresAt: daysAgo(KEEP_DAYS.expiredSession + 1), ip: '203.0.113.9' } });
  await prisma.emailCode.create({ data: { email: 'keep@example.com', purpose: 'reset', codeHash: 'x', expiresAt: daysAgo(2) } });
  await prisma.accountSignal.create({ data: { userId: buyer.id, kind: 'old', points: 1, details: {}, createdAt: daysAgo(KEEP_DAYS.accountSignal + 1) } });
  await prisma.listingView.create({ data: { listingId: 'keep-chat-live', viewerKey: buyer.id, day: daysAgo(KEEP_DAYS.listingView + 1) } });
  await prisma.report.create({ data: { reporterId: buyer.id, targetType: 'user', targetId: seller.id, reason: 'other', resolvedAt: daysAgo(KEEP_DAYS.resolvedReport + 1) } });
  const openReport = await prisma.report.create({ data: { reporterId: buyer.id, targetType: 'user', targetId: seller.id, reason: 'other', createdAt: daysAgo(3000) } });

  const done = await runRetention();
  assert.equal(await prisma.chat.count({ where: { id: oldChat.id } }), 0);
  assert.equal(await prisma.chat.count({ where: { id: liveChat.id } }), 1, 'the item is still on sale');
  assert.equal(await prisma.supportThread.count({ where: { id: thread.id } }), 0);
  assert.equal(await prisma.session.count({ where: { id: session.id } }), 0);
  assert.equal(await prisma.emailCode.count({ where: { email: 'keep@example.com' } }), 0);
  assert.equal(await prisma.accountSignal.count({ where: { userId: buyer.id } }), 0);
  assert.equal(await prisma.listingView.count({ where: { viewerKey: buyer.id } }), 0);
  assert.equal(await prisma.report.count({ where: { id: openReport.id } }), 1, 'an open report waits for an admin, however old');
  assert.equal(await prisma.report.count({ where: { reporterId: buyer.id } }), 1);
  assert.ok(done.chats >= 1 && done.sessions >= 1);
  // The signed-in person is untouched, and a second run does nothing new to them.
  assert.equal((await api.call('GET', '/me', buyer)).status, 200);
  await runRetention();
  assert.equal((await api.call('GET', '/me', buyer)).status, 200);
});
