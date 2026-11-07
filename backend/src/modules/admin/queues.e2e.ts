// The dashboard's review queues (BACKEND_PLAN B8.3): reported listings and
// accounts, suspicious-account flags, and test certificates whose stamp an admin
// checks. Each decision is in the audit log and closes what it decided.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';
import { flushJobs } from '../../lib/jobs';
import { privateStorage } from '../../lib/storage';
import { hashPassword } from '../auth/password';
import { fakePushes } from '../notifications/push';
import { adminToken } from './testing';

let base = '';
const server = app.listen(0);
const EMAILS = [
  'queue.seller@example.com',
  'queue.r1@example.com',
  'queue.r2@example.com',
  'queue.r3@example.com',
  'queue.r4@example.com',
  'e2e.queue.admin@sahla.jo',
];
type Person = { id: string; token: string };
const people: Person[] = [];
const [seller, r1, r2, r3, r4, admin] = [0, 1, 2, 3, 4, 5].map(i => () => people[i]!);
const LISTINGS = ['queue-kept', 'queue-removed', 'queue-paid', 'queue-cert-ok', 'queue-cert-fake', 'queue-cert-paid'];
const SELLER_PHONE = 'fcm-token-queue-seller-0123456789abcdef';

const call = async (method: string, path: string, who?: { token: string }, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(who && { Authorization: `Bearer ${who.token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text && r.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
};
const report = (who: Person, targetType: 'listing' | 'user', targetId: string, reason = 'scam') =>
  call('POST', '/reports', who, { targetType, targetId, reason, details: `${targetId} looks wrong` });
const isHidden = async (id: string) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).reportHidden;
const actions = async (targetType: string, targetId: string) =>
  (await call('GET', `/admin/actions?targetType=${targetType}&targetId=${targetId}`, admin())).body.map((a: { action: string }) => a.action);
const pushesToSeller = async () => {
  await flushJobs();
  return fakePushes.sent.splice(0).filter(p => p.token === SELLER_PHONE).map(p => p.message);
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const passwordHash = await hashPassword('longenough');
  for (const email of EMAILS) {
    const isAdmin = email.endsWith('@sahla.jo');
    const user = await prisma.user.create({ data: { name: email.split('@')[0]!, email, passwordHash, ...(isAdmin && { role: 'admin', adminRole: 'owner' }) } });
    const token = isAdmin
      ? await adminToken(user.id)
      : (await call('POST', '/auth/login', undefined, { email, password: 'longenough' })).body.token;
    people.push({ id: user.id, token });
  }
  assert.equal((await call('POST', '/me/devices', seller(), { token: SELLER_PHONE, platform: 'android', language: 'en' })).status, 204);
  await prisma.listing.createMany({
    data: LISTINGS.map(id => ({
      id, category: 'mobiles', type: 'phones', titleAr: 'هاتف', titleEn: id, priceFils: 150_000,
      imageUrls: ['https://images.example.com/phone.jpg'], condition: 'good' as const, locationId: 'amman',
      description: 'A phone in good shape with a new battery, the original box and a charging cable.',
      sellerUserId: people[0]!.id,
    })),
  });
});
after(async () => {
  await flushJobs();
  server.close();
  await prisma.order.deleteMany({ where: { listingId: { in: LISTINGS } } });
  await prisma.listing.deleteMany({ where: { id: { in: LISTINGS } } });
  await prisma.testCertificate.deleteMany({ where: { userId: people[0]?.id } });
  await prisma.report.deleteMany({ where: { targetId: { in: [...LISTINGS, ...people.map(p => p.id)] } } });
  await prisma.adminAction.deleteMany({ where: { adminId: people[5]?.id } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('reported listings: hidden ones first; keep puts it back and old reports no longer count', async () => {
  for (const who of [r1(), r2(), r3()]) assert.equal((await report(who, 'listing', 'queue-kept')).status, 204);
  await report(r1(), 'listing', 'queue-removed', 'prohibited');
  assert.equal(await isHidden('queue-kept'), true);
  assert.equal((await call('GET', '/admin/reports/listings', r1())).status, 403); // an app token

  const queue = (await call('GET', '/admin/reports/listings', admin())).body;
  const ids = queue.map((q: { listing: { id: string } }) => q.listing.id);
  assert.ok(ids.indexOf('queue-kept') < ids.indexOf('queue-removed'), 'hidden first');
  const kept = queue.find((q: { listing: { id: string } }) => q.listing.id === 'queue-kept');
  assert.equal(kept.listing.reportHidden, true);
  assert.deepEqual(kept.reasons, { scam: 3 });
  assert.equal(kept.reports.length, 3);
  assert.equal(kept.seller.id, seller().id);
  assert.equal(kept.reports[0].details, 'queue-kept looks wrong');

  assert.equal((await call('POST', '/admin/listings/queue-kept/keep', admin(), { reason: 'x' })).status, 422); // reason too short
  assert.equal((await call('POST', '/admin/listings/queue-kept/keep', admin(), { reason: 'Checked the photos, it is fine' })).status, 204);
  assert.equal(await isHidden('queue-kept'), false);
  const after = (await call('GET', '/admin/reports/listings', admin())).body;
  assert.ok(!after.some((q: { listing: { id: string } }) => q.listing.id === 'queue-kept'));
  assert.deepEqual(await actions('listing', 'queue-kept'), ['listing.keep']);

  // The same three people's old reports don't hide it again: one new report doesn't either.
  await report(r4(), 'listing', 'queue-kept');
  assert.equal(await isHidden('queue-kept'), false);
});

test('remove: off sale for good, the seller gets a push; not while an order is paid', async () => {
  await pushesToSeller();
  assert.equal((await call('POST', '/admin/listings/queue-removed/remove', admin(), { reason: 'Sells a counterfeit phone' })).status, 204);
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: 'queue-removed' } });
  assert.equal(listing.status, 'withdrawn');
  assert.equal((await call('GET', '/listings/queue-removed')).status, 404);
  const [push] = await pushesToSeller();
  assert.equal(push?.data.type, 'sale');
  assert.match(push!.body, /reports/);
  const resolved = await prisma.report.findMany({ where: { targetId: 'queue-removed' } });
  assert.ok(resolved.every(r => r.resolution === 'removed' && r.resolvedById === admin().id));
  assert.equal((await call('POST', '/admin/listings/queue-removed/remove', admin(), { reason: 'Again please' })).status, 422);

  const order = (await call('POST', '/orders', r2(), {
    listingId: 'queue-paid',
    delivery: { name: 'Omar Haddad', phone: '0791234567', cityId: 'amman', address: 'Rainbow St, building 12' },
  })).body;
  assert.equal((await call('POST', `/orders/${order.id}/pay`, r2(), { cardToken: 'mock_visa_4242' })).status, 200);
  const paid = await call('POST', '/admin/listings/queue-paid/remove', admin(), { reason: 'Sells a counterfeit phone' });
  assert.equal(paid.status, 409);
  assert.equal(paid.body.error.code, 'OPEN_ORDERS');
});

test('reported accounts: dismiss closes the reports; suspending closes them and the open flags', async () => {
  await report(r1(), 'user', r3().id, 'offensive');
  await report(r2(), 'user', r3().id, 'offensive');
  await report(r1(), 'user', r4().id, 'scam');
  const queue = (await call('GET', '/admin/reports/users', admin())).body;
  assert.equal(queue[0].user.id, r3().id); // the most reporters first
  assert.deepEqual(queue[0].reasons, { offensive: 2 });

  assert.equal((await call('POST', `/admin/reports/users/${r3().id}/dismiss`, admin(), { reason: 'A heated chat, nothing more' })).status, 204);
  assert.equal((await call('POST', `/admin/reports/users/${r3().id}/dismiss`, admin(), { reason: 'Again please' })).status, 422);
  assert.deepEqual(await actions('user', r3().id), ['user.reports_dismiss']);

  const flag = await prisma.riskFlag.create({ data: { userId: r4().id, score: 55, signals: [{ kind: 'reports_received', points: 25, details: {} }] } });
  assert.equal((await call('POST', `/admin/users/${r4().id}/suspend`, admin(), { reason: 'Scams buyers in chat' })).status, 200);
  const reports = await prisma.report.findMany({ where: { targetType: 'user', targetId: r4().id } });
  assert.ok(reports.every(r => r.resolution === 'suspended'));
  const closed = await prisma.riskFlag.findUniqueOrThrow({ where: { id: flag.id } });
  assert.equal(closed.status, 'actioned');
  assert.equal(closed.reviewNote, 'Suspended: Scams buyers in chat');
  const left = (await call('GET', '/admin/reports/users', admin())).body.map((q: { user: { id: string } }) => q.user.id);
  assert.ok(!left.includes(r3().id) && !left.includes(r4().id));
});

test('risk flags: the highest score first; review once with a note', async () => {
  const low = await prisma.riskFlag.create({ data: { userId: r1().id, score: 45, signals: [{ kind: 'shared_device', points: 45, details: { accounts: 3 } }] } });
  const high = await prisma.riskFlag.create({ data: { userId: r2().id, score: 80, signals: [{ kind: 'disposable_email', points: 30, details: {} }], aiSummary: 'New account on a throwaway email' } });
  const open = (await call('GET', '/admin/risk-flags', admin())).body;
  const ids = open.map((f: { id: string }) => f.id);
  assert.ok(ids.indexOf(high.id) < ids.indexOf(low.id));
  const shown = open.find((f: { id: string }) => f.id === high.id);
  assert.equal(shown.user.email, EMAILS[2]);
  assert.equal(shown.signals[0].kind, 'disposable_email');
  assert.equal(shown.aiSummary, 'New account on a throwaway email');

  assert.equal((await call('POST', `/admin/risk-flags/${high.id}/review`, admin(), { status: 'open', note: 'Looked at it' })).status, 422);
  assert.equal((await call('POST', `/admin/risk-flags/${high.id}/review`, admin(), { status: 'dismissed', note: 'A real student, checked' })).status, 204);
  assert.equal((await call('POST', `/admin/risk-flags/${high.id}/review`, admin(), { status: 'actioned', note: 'Twice' })).status, 422);
  const dismissed = (await call('GET', '/admin/risk-flags?status=dismissed', admin())).body;
  const reviewed = dismissed.find((f: { id: string }) => f.id === high.id);
  assert.equal(reviewed.reviewedBy.id, admin().id);
  assert.equal(reviewed.reviewNote, 'A real student, checked');
  assert.ok(!(await call('GET', '/admin/risk-flags', admin())).body.some((f: { id: string }) => f.id === high.id));
  assert.deepEqual(await actions('user', r2().id), ['risk_flag.dismissed']);
});

test('certificates: the stamp queue, the private photo, approve and reject', async () => {
  const certificate = async (listingId: string) => {
    const photoUrl = await privateStorage.put(`certificates/e2e-${listingId}.jpg`, Buffer.from(`photo of ${listingId}`));
    const row = await prisma.testCertificate.create({
      data: {
        userId: seller().id, status: 'passed', category: 'mobiles', type: 'phones', brand: 'Apple', model: 'iPhone 13',
        shopName: 'Fix It Phones', shopPhone: '0791112223', testedAt: new Date(), device: 'iPhone 13 128GB', specs: ['Battery 91%'],
        photoUrl, blurredUrl: `/files/certificates/e2e-${listingId}_blurred.jpg`, imageHash: `hash-${listingId}`,
        ocrProvider: 'fake', ocrText: 'FIX IT PHONES', serialHashes: [],
      },
    });
    await prisma.listing.update({ where: { id: listingId }, data: { testCertificateId: row.id } });
    return row;
  };
  const ok = await certificate('queue-cert-ok');
  const fake = await certificate('queue-cert-fake');
  const paid = await certificate('queue-cert-paid');

  const queue = (await call('GET', '/admin/certificates', admin())).body;
  const ids = queue.map((c: { id: string }) => c.id);
  assert.deepEqual(ids.filter((id: string) => [ok.id, fake.id, paid.id].includes(id)), [ok.id, fake.id, paid.id]); // oldest first
  const shown = queue.find((c: { id: string }) => c.id === ok.id);
  assert.equal(shown.listing.id, 'queue-cert-ok');
  assert.equal(shown.read.shopName, 'Fix It Phones');
  assert.match(shown.blurredUrl, /^https?:\/\/.+\/files\/certificates\/e2e-queue-cert-ok_blurred\.jpg$/);
  assert.equal('photoUrl' in shown, false);

  const photo = await fetch(`${base}/admin/certificates/${ok.id}/photo`, { headers: { Authorization: `Bearer ${admin().token}` } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('cache-control'), 'private, no-store');
  assert.equal(await photo.text(), 'photo of queue-cert-ok');
  assert.equal((await call('GET', `/admin/certificates/${ok.id}/photo`, seller())).status, 403);

  assert.equal((await call('POST', `/admin/certificates/${ok.id}/approve`, admin())).status, 204);
  assert.equal((await call('POST', `/admin/certificates/${ok.id}/approve`, admin())).status, 422);
  assert.equal((await prisma.testCertificate.findUniqueOrThrow({ where: { id: ok.id } })).stampChecked, true);

  await pushesToSeller();
  assert.equal((await call('POST', `/admin/certificates/${fake.id}/reject`, admin(), { reason: 'No shop stamp, printed at home' })).status, 204);
  const rejected = await prisma.testCertificate.findUniqueOrThrow({ where: { id: fake.id }, include: { listing: true } });
  assert.equal(rejected.status, 'failed');
  assert.ok(rejected.problems.includes('admin_rejected'));
  assert.equal(rejected.listing?.status, 'withdrawn');
  const [push] = await pushesToSeller();
  assert.match(push!.body, /test certificate/);
  assert.deepEqual(await actions('certificate', fake.id), ['certificate.reject']);

  const order = (await call('POST', '/orders', r1(), {
    listingId: 'queue-cert-paid',
    delivery: { name: 'Omar Haddad', phone: '0791234567', cityId: 'amman', address: 'Rainbow St, building 12' },
  })).body;
  assert.equal((await call('POST', `/orders/${order.id}/pay`, r1(), { cardToken: 'mock_visa_4242' })).status, 200);
  assert.equal((await call('POST', `/admin/certificates/${paid.id}/reject`, admin(), { reason: 'No shop stamp at all' })).status, 409);

  const left = (await call('GET', '/admin/certificates', admin())).body.map((c: { id: string }) => c.id);
  assert.ok(!left.includes(ok.id) && !left.includes(fake.id) && left.includes(paid.id));
  await privateStorage.remove(ok.photoUrl);
  await privateStorage.remove(fake.photoUrl);
  await privateStorage.remove(paid.photoUrl);
});

test('the overview counts open reports', async () => {
  await report(r1(), 'user', r2().id, 'other');
  const stats = (await call('GET', '/admin/stats', admin())).body;
  assert.ok(stats.queues.reportedUsers >= 1);
  assert.equal(typeof stats.queues.reportedListings, 'number');
});
