// SECURITY_PLAN S3.7 and S3.8: the seller's bank account, and the daily money check.

import { isJordanIban, normalizeIban } from '@/lib/iban';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { cleanUp, newListing, newPerson, paidOrder, PASSWORD, startApi, type Person } from '../../lib/testkit';
import { fakePushes } from '../notifications/push';
import { findMoneyProblems } from '../orders/moneyCheck';

const api = startApi();
const { call } = api;
const IBAN = 'JO94CBJO0010000000000131000302';
const IBAN2 = 'JO71CBJO0000000000001234567890';
const EMAILS = ['payout.seller@example.com', 'payout.google@example.com', 'payout.buyer@example.com', 'payout.finance@sahla.jo', 'payout.support@sahla.jo', 'e2e.payout.rider@sahla.jo'];
let seller: Person, google: Person, buyer: Person, finance: Person, support: Person, rider: Person;
const LISTINGS = ['payout-a', 'money-a', 'money-b'];

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  seller = await newPerson(api, EMAILS[0]);
  google = await newPerson(api, EMAILS[1]);
  await prisma.user.update({ where: { id: google.id }, data: { passwordHash: null, method: 'google' } });
  buyer = await newPerson(api, EMAILS[2]);
  finance = await newPerson(api, EMAILS[3], { role: 'admin', adminRole: 'finance' });
  support = await newPerson(api, EMAILS[4], { role: 'admin', adminRole: 'support' });
  rider = await newPerson(api, EMAILS[5], { role: 'courier' });
});
after(async () => {
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

const deliver = async (listingId: string) => {
  await newListing(seller.id, listingId);
  const { id, pin } = await paidOrder(api, buyer, listingId);
  await prisma.order.update({ where: { id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  assert.equal((await call('POST', '/courier/confirm-delivery', rider, { orderId: id, pin })).status, 200);
  return prisma.payout.findUniqueOrThrow({ where: { orderId: id } });
};

test('IBANs: real ones pass, typos and other countries don’t', () => {
  assert.ok(isJordanIban(IBAN));
  assert.ok(isJordanIban(normalizeIban('jo94 cbjo-0010 0000 0000 0131 000302')));
  assert.ok(isJordanIban(normalizeIban('JO٩٤CBJO0010000000000131000302')), 'Arabic digits');
  for (const bad of ['JO94CBJO0010000000000131000303', 'GB82WEST12345698765432', 'JO94', '', 'JO94CBJO001000000000013100030$'])
    assert.ok(!isJordanIban(normalizeIban(bad)), bad);
});

test('the account needs the password; the IBAN is encrypted and only its last 4 come back', async () => {
  assert.deepEqual((await call('GET', '/me/payout-account', seller)).body, { confirmWith: 'password', account: null });
  const body = { holderName: 'Payout Seller', iban: IBAN };
  assert.equal((await call('PUT', '/me/payout-account', seller, body)).body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await call('PUT', '/me/payout-account', seller, { ...body, password: 'wrong-password' })).body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await call('PUT', '/me/payout-account', seller, { ...body, iban: 'JO94CBJO0010000000000131000303', password: PASSWORD })).status, 422);

  const saved = await call('PUT', '/me/payout-account', seller, { ...body, password: PASSWORD });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.account, { holderName: 'Payout Seller', ibanLast4: '0302' });
  assert.ok(!JSON.stringify(saved.body).includes(IBAN));
  const row = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
  assert.ok(row.payoutIban && !row.payoutIban.includes(IBAN) && !row.payoutIban.includes('CBJO'), 'stored encrypted');
  assert.equal(row.payoutChangedAt, null, 'the first account isn’t held');
  assert.ok(!/payout(Iban|Holder)|"iban/i.test(JSON.stringify((await call('GET', '/me', seller)).body)), 'not part of the profile');
});

test('a Google account confirms with an emailed code instead', async () => {
  assert.equal((await call('GET', '/me/payout-account', google)).body.confirmWith, 'code');
  assert.equal((await call('POST', '/me/payout-account/code', google)).status, 204);
  const body = { holderName: 'Google Seller', iban: IBAN };
  assert.equal((await call('PUT', '/me/payout-account', google, { ...body, code: '000000' })).body.error.code, 'INVALID_CODE');
  assert.equal((await call('PUT', '/me/payout-account', google, { ...body, code: process.env.DEV_EMAIL_CODE })).status, 200);
  assert.equal((await call('POST', '/me/payout-account/code', seller)).status, 422, 'password accounts use the password');
});

test('finance sees the account; a change holds the payout 24 hours and alerts the seller', async () => {
  const payout = await deliver('payout-a');
  const row = (list: { id: string }[]) => list.find(p => p.id === payout.id) as unknown as { account: { iban: string; holderName: string; heldUntil?: string } };
  assert.deepEqual(row((await call('GET', '/admin/payouts', finance)).body).account, { holderName: 'Payout Seller', iban: IBAN });
  assert.equal((await call('GET', '/admin/payouts', support)).status, 403, 'support can’t see bank details');

  await prisma.device.create({ data: { token: 'payout-seller-phone-token-1', userId: seller.id, platform: 'android', language: 'en' } });
  await flushJobs(); // the first account's alert, from the test above
  fakePushes.sent.length = 0;
  const changed = await call('PUT', '/me/payout-account', seller, { holderName: 'Someone Else', iban: IBAN2, password: PASSWORD });
  assert.ok(changed.body.account.heldUntil, 'the app shows the hold');
  await flushJobs();
  assert.ok(fakePushes.sent.some(p => p.message.body.includes('7890') && p.message.body.includes('support')), 'the seller is told');

  const held = row((await call('GET', '/admin/payouts', finance)).body).account;
  assert.ok(held.heldUntil, 'finance sees the hold');
  const early = await call('POST', `/admin/payouts/${payout.id}/paid`, finance, { reference: 'TR-1' });
  assert.equal(early.status, 422);
  assert.match(early.body.error.message, /changed/);

  // A day later it can go, and the audit log records which account it went to.
  await prisma.user.update({ where: { id: seller.id }, data: { payoutChangedAt: new Date(Date.now() - 25 * 3_600_000) } });
  assert.equal((await call('POST', `/admin/payouts/${payout.id}/paid`, finance, { reference: 'TR-2' })).status, 200);
  const logged = await prisma.adminAction.findFirstOrThrow({ where: { action: 'payout.paid', targetId: (await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).orderId } });
  assert.equal((logged.details as { ibanLast4: string }).ibanLast4, '7890');
});

test('no account, no payout', async () => {
  await prisma.user.update({ where: { id: seller.id }, data: { payoutIban: null, payoutHolder: null, payoutIbanLast4: null, payoutChangedAt: null } });
  await newListing(seller.id, 'money-a');
  const { id, pin } = await paidOrder(api, buyer, 'money-a');
  await prisma.order.update({ where: { id }, data: { courierId: rider.id, courierStatus: 'picked_up' } });
  await call('POST', '/courier/confirm-delivery', rider, { orderId: id, pin });
  const payout = await prisma.payout.findUniqueOrThrow({ where: { orderId: id } });
  const r = await call('POST', `/admin/payouts/${payout.id}/paid`, finance, { reference: 'TR-3' });
  assert.equal(r.status, 422);
  assert.match(r.body.error.message, /bank account/);
});

test('the money check is quiet on real flows and names each kind of tampering', async () => {
  const kinds = async (orderId: string) => (await findMoneyProblems()).filter(p => p.orderId === orderId).map(p => p.kind).sort();
  await newListing(seller.id, 'money-b');
  const { id } = await paidOrder(api, buyer, 'money-b');
  assert.deepEqual(await kinds(id), [], 'a paid order adds up');

  // A total that doesn't add up, and a payment that isn't the total.
  await prisma.order.update({ where: { id }, data: { totalFils: 1 } });
  assert.deepEqual(await kinds(id), ['payment_amount', 'wrong_total']);
  const paid = await prisma.order.findUniqueOrThrow({ where: { id } });
  await prisma.order.update({ where: { id }, data: { totalFils: paid.itemPriceFils + paid.buyerProtectionFils + paid.deliveryFils } });

  // Two succeeded payments; none.
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: id } });
  const extra = await prisma.payment.create({ data: { orderId: id, provider: 'fake', providerRef: `extra-${id}`, amountFils: payment.amountFils, status: 'succeeded' } });
  assert.deepEqual(await kinds(id), ['paid_payment_count']);
  await prisma.payment.delete({ where: { id: extra.id } });
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'refunded' } });
  assert.deepEqual(await kinds(id), ['paid_payment_count']);
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'succeeded' } });

  // A listing back on sale while the money is held.
  await prisma.listing.update({ where: { id: 'money-b' }, data: { status: 'active' } });
  assert.deepEqual(await kinds(id), ['listing_status']);
  await prisma.listing.update({ where: { id: 'money-b' }, data: { status: 'reserved' } });

  // Refunded in our records, but the payment still says it's taken.
  await prisma.order.update({ where: { id }, data: { status: 'refunded' } });
  assert.deepEqual(await kinds(id), ['money_kept']);

  // Delivered with no payout, a wrong payout, a payout on an undelivered order.
  await prisma.order.update({ where: { id }, data: { status: 'completed' } });
  await prisma.listing.update({ where: { id: 'money-b' }, data: { status: 'sold' } });
  assert.deepEqual(await kinds(id), ['delivered_no_payout']);
  await prisma.payout.create({ data: { orderId: id, sellerUserId: seller.id, amountFils: 1 } });
  assert.deepEqual(await kinds(id), ['payout_amount']);
  await prisma.payout.update({ where: { orderId: id }, data: { amountFils: paid.itemPriceFils } });
  assert.deepEqual(await kinds(id), []);
  await prisma.order.update({ where: { id }, data: { status: 'escrow_held' } });
  await prisma.listing.update({ where: { id: 'money-b' }, data: { status: 'reserved' } });
  assert.deepEqual(await kinds(id), ['payout_not_delivered']);
});
