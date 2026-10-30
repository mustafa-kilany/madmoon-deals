// POST /test-certificates (BACKEND_PLAN B4.3, B4.4, B4.6) with the fake reader
// and with scripted pages of text: pass, each problem, reuse, the blurred copy.

import assert from 'node:assert/strict';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { app } from '../../app';
import { prisma } from '../../db';
import { privateDir, uploadDir } from '../../lib/storage';
import { fakeOcr } from './fakeOcr';
import type { OcrProvider } from './ocr';
import { useOcrForTests } from './service';

let base = '';
let token = '';
const server = app.listen(0);
const EMAIL = 'cert.seller@example.com';
const IPHONE = { category: 'mobiles', type: 'phones', brand: 'Apple', model: 'iPhone 14 Pro' };

const paper = (seed: number) =>
  sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#ffffff', noise: { type: 'gaussian', mean: 128 + seed, sigma: 50 } } })
    .jpeg()
    .toBuffer();

const check = async (photo: Buffer | null, device: Record<string, string> = IPHONE) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(device)) form.append(key, value);
  if (photo) form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'report.jpg');
  const r = await fetch(`${base}/test-certificates`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
};

/** A reader that "sees" this page of text. */
const reads = (text: string, confidence = 0.95): OcrProvider => ({
  name: 'scripted',
  read: async () => ({ provider: 'scripted', text, words: [], confidence }),
});
const today = () => new Date().toLocaleDateString('en-GB', { timeZone: 'UTC' }); // dd/mm/yyyy
const report = (lines: Partial<Record<'shop' | 'phone' | 'device' | 'specs' | 'date', string>> = {}) =>
  [
    lines.shop ?? 'مركز النور للخلويات',
    lines.phone ?? 'هاتف 0795551234',
    lines.device ?? 'Apple iPhone 14 Pro',
    lines.specs ?? '256GB Battery 88%',
    lines.date ?? today(),
  ].join('\n');

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const r = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hala', email: EMAIL, password: 'longenough', code: '123456' }),
  });
  token = (await r.json()).token;
});
after(async () => {
  server.close();
  useOcrForTests(null);
  await prisma.listing.deleteMany({ where: { id: 'cert-listing' } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('development reader: passes, with the shop, date, device and specs; the OCR text stays on the server', async () => {
  useOcrForTests(fakeOcr);
  const r = await check(await paper(1));
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.status, r.body.problems], ['passed', []]);
  assert.equal(r.body.device, 'Apple iPhone 14 Pro');
  assert.match(r.body.shopName, /سهلة|Sahla/);
  assert.deepEqual(r.body.specs, ['128GB', 'Battery 91%']);
  assert.equal(r.body.testedAt.slice(0, 10), new Date().toISOString().slice(0, 10));
  assert.equal(r.body.ocrText, undefined);
});

test('buyers get a copy with the IMEI blurred; the original is private', async () => {
  useOcrForTests(fakeOcr);
  const { body } = await check(await paper(2));
  const cert = await prisma.testCertificate.findUniqueOrThrow({ where: { id: body.id } });
  assert.match(cert.photoUrl, /^private:certificates\//);
  assert.match(cert.blurredUrl!, /^\/files\/certificates\/.+_blurred\.jpg$/);
  assert.equal(cert.serialHashes.length, 1);
  assert.ok(!cert.serialHashes[0].startsWith('35'), 'only a hash of the IMEI is kept');

  const origin = base.replace('/v1', '');
  assert.equal((await fetch(origin + cert.blurredUrl)).status, 200);
  assert.equal((await fetch(`${origin}/files/${cert.photoUrl.replace('private:', '')}`)).status, 404);

  // The IMEI number is on line 6 of the fake page (x 216–486, y 410–450): smooth in the copy, noisy in the original.
  const roughness = async (file: string) => {
    // stats() reads the input, so cut the area out first.
    const area = await sharp(file).extract({ left: 240, top: 414, width: 200, height: 32 }).toBuffer();
    const { channels } = await sharp(area).stats();
    return channels[0].stdev;
  };
  const original = await roughness(path.join(privateDir, cert.photoUrl.replace('private:', '')));
  const blurred = await roughness(path.join(uploadDir, cert.blurredUrl!.replace('/files/', '')));
  assert.ok(blurred < original / 3, `blurred ${blurred} vs original ${original}`);
});

test('each problem the reader can find', async () => {
  const cases: [string, OcrProvider, string[]][] = [
    ['too little text', reads('Apple 128GB'), ['unreadable']],
    ['low confidence', reads(report(), 0.3), ['unreadable']],
    ['no phone number', reads(report({ phone: 'هاتف —' })), ['no_shop']],
    ['a bigger model on the paper', reads(report({ device: 'Apple iPhone 14 Pro Max' })), ['device_mismatch']],
    ['another brand', reads(report({ device: 'Samsung Galaxy S23' })), ['device_mismatch']],
    ['no specs', reads(report({ specs: 'جهاز سليم' })), ['no_specs']],
    ['two months old', reads(report({ date: new Date(Date.now() - 60 * 86_400_000).toLocaleDateString('en-GB') })), ['too_old']],
  ];
  let seed = 10;
  for (const [name, reader, problems] of cases) {
    useOcrForTests(() => reader);
    const r = await check(await paper(seed++));
    assert.deepEqual([r.status, r.body.status, r.body.problems], [201, 'failed', problems], name);
  }
  useOcrForTests(() => reads(report()));
  const passed = await check(await paper(seed));
  assert.deepEqual([passed.body.status, passed.body.shopName, passed.body.specs], ['passed', 'مركز النور للخلويات', ['256GB', 'Battery 88%']]);
});

test('already_used: the same photo or IMEI on another listing', async () => {
  useOcrForTests(fakeOcr);
  const photo = await paper(30);
  const first = await check(photo);
  assert.equal(first.body.status, 'passed');
  // Not on a listing yet: checking again is fine (the seller retried).
  assert.equal((await check(photo)).body.status, 'passed');

  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  await prisma.listing.create({
    data: {
      id: 'cert-listing', category: 'mobiles', type: 'phones', titleAr: 'ايفون', titleEn: 'iPhone', priceFils: 500_000,
      imageUrls: ['/files/listings/x.jpg'], condition: 'good', locationId: 'amman-khalda',
      description: 'iPhone 14 Pro in very good condition with box and charger, battery at ninety one percent.',
      brand: 'Apple', model: 'iPhone 14 Pro', sellerUserId: user.id, testCertificateId: first.body.id,
    },
  });
  const reused = await check(photo);
  assert.deepEqual([reused.body.status, reused.body.problems], ['failed', ['already_used']]);

  // Same IMEI on a new photo of the same paper.
  const imei = (await prisma.testCertificate.findUniqueOrThrow({ where: { id: first.body.id } })).ocrText.match(/IMEI: (\d{15})/)![1];
  useOcrForTests(() => reads(`${report()}\nIMEI ${imei}`));
  assert.deepEqual((await check(await paper(31))).body.problems, ['already_used']);

  // Withdrawn: the report is free again.
  await prisma.listing.update({ where: { id: 'cert-listing' }, data: { status: 'withdrawn' } });
  assert.deepEqual((await check(await paper(32))).body.problems, []);
});

test('bad requests are 422 VALIDATION', async () => {
  useOcrForTests(fakeOcr);
  const photo = await paper(40);
  const bad: [string, Buffer | null, Record<string, string>][] = [
    ['no photo', null, IPHONE],
    ['not a photo', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 1)]), IPHONE],
    ['a type without certificates', photo, { category: 'furniture', type: 'tables', brand: 'IKEA' }],
    ['unknown type', photo, { ...IPHONE, type: 'drones' }],
    ['no brand', photo, { category: 'mobiles', type: 'phones', brand: '' }],
  ];
  for (const [name, file, device] of bad) {
    const r = await check(file, device);
    assert.deepEqual([r.status, r.body.error?.code], [422, 'VALIDATION'], name);
  }
});
