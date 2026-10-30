// ID verification until Sanad (BACKEND_PLAN B3.5): photo → pending → an admin
// approves (Verified badge) or rejects (try again). The photo is never public.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { app } from '../../app';
import { prisma } from '../../db';
import { privateDir } from '../../lib/storage';
import { decideIdVerification } from './manualReview';

let base = '';
let token = '';
const server = app.listen(0);
const EMAIL = 'id.check@example.com';

const idPhoto = () =>
  sharp({ create: { width: 1200, height: 760, channels: 3, background: '#ffffff', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg()
    .toBuffer();

const send = async (data: Buffer, auth = token) => {
  const form = new FormData();
  form.append('idPhoto', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), 'id.jpg');
  const r = await fetch(`${base}/me/id-verification`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${auth}` } });
  return { status: r.status, body: await r.json() };
};
const me = async () => (await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const pendingPhotos = async () =>
  (await prisma.idVerification.findMany({ where: { user: { email: EMAIL }, status: 'pending' } })).map(p => p.photoUrl!);
const onDisk = (ref: string) => existsSync(path.join(privateDir, ref.replace(/^private:/, '')));

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const signup = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nour', email: EMAIL, password: 'longenough', code: '123456' }),
  });
  token = (await signup.json()).token;
});
after(async () => {
  server.close();
  await prisma.listing.deleteMany({ where: { id: 'id-check-listing' } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('sending the ID photo makes the account pending, not verified', async () => {
  assert.deepEqual([(await me()).verified, (await me()).idVerification], [false, undefined]);
  const r = await send(await idPhoto());
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.verified, r.body.idVerification], [false, 'pending']);

  const [ref] = await pendingPhotos();
  assert.match(ref, /^private:id\//);
  assert.ok(onDisk(ref), 'saved for the admin');
  // Never public: it isn't under /files at all.
  const origin = base.replace('/v1', '');
  assert.equal((await fetch(`${origin}/files/${ref.replace('private:', '')}`)).status, 404);
});

test('a new photo replaces the pending one; not-photos are refused', async () => {
  const [first] = await pendingPhotos();
  await send(await idPhoto());
  const now = await pendingPhotos();
  assert.equal(now.length, 1);
  assert.notEqual(now[0], first);
  assert.ok(!onDisk(first), 'the replaced photo is deleted');
  const pdf = await send(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 1)]));
  assert.deepEqual([pdf.status, pdf.body.error.code], [422, 'VALIDATION']);
});

test('rejected → they can try again → approved: Verified badge, also on their listings', async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  await prisma.listing.create({
    data: {
      id: 'id-check-listing', category: 'kids', type: 'toys', titleAr: 'لعبة', titleEn: 'Toy', priceFils: 5000,
      imageUrls: ['https://images.example.com/toy.jpg'], condition: 'good', locationId: 'amman-khalda',
      description: 'A wooden toy train set with twelve pieces, complete and in good condition.',
      sellerUserId: user.id,
    },
  });
  const [photo] = await pendingPhotos();
  await decideIdVerification(EMAIL, 'reject', null, 'Blurry');
  assert.deepEqual([(await me()).verified, (await me()).idVerification], [false, 'rejected']);
  assert.ok(!onDisk(photo), 'deleted once decided');

  await send(await idPhoto());
  assert.equal((await me()).idVerification, 'pending');
  await decideIdVerification(EMAIL, 'approve', null);
  const after = await me();
  assert.deepEqual([after.verified, after.idVerification], [true, undefined]);
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: 'id-check-listing' } });
  assert.equal(listing.sellerVerified, true);
  const history = await prisma.idVerification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(history.map(h => [h.status, h.photoUrl]), [['rejected', null], ['approved', null]]);

  await assert.rejects(decideIdVerification(EMAIL, 'approve', null)); // nothing pending any more
});
