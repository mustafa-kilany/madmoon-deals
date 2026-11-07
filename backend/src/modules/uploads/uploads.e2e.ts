// Photos (BACKEND_PLAN B3): listing photos and avatars from customers, category
// pictures from admins, and the clean-up of photos no listing used.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { app } from '../../app';
import { prisma } from '../../db';
import { storage } from '../../lib/storage';
import { adminToken } from '../admin/testing';
import { createAdmin, createCourier } from '../staff/service';
import { deleteUnusedUploads } from './cleanup';

let base = '';
let origin = '';
const server = app.listen(0);
const tokens: Record<'customer' | 'courier' | 'admin', string> = { customer: '', courier: '', admin: '' };
const created: string[] = [];

const json = async (path: string, body: unknown) =>
  (
    await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  ).json();

/** A noisy photo (so it isn't tiny) with a GPS position in its EXIF data. */
const photoWithGps = () =>
  sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#7D9C65', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '31/1 57/1 14/1', GPSLongitudeRef: 'E', GPSLongitude: '35/1 54/1 38/1' } })
    .toBuffer();

const upload = (path: string, field: string, data: Buffer, token?: string, method = 'POST') => {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), 'photo.jpg');
  return fetch(base + path, { method, body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
};

const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `${origin}/v1`;
  tokens.customer = (
    await json('/auth/signup', { name: 'Photo Tester', email: 'photos@example.com', password: 'longenough', code: '123456' })
  ).token;
  await createCourier({ name: 'E2E Photo Courier', email: 'e2e.photo.courier@sahla.jo' });
  const admin = await createAdmin({ name: 'E2E Photo Admin', email: 'e2e.photo.admin@sahla.jo' }, 'owner');
  tokens.courier = (
    await json('/auth/reset-password', { email: 'e2e.photo.courier@sahla.jo', code: '123456', password: 'staffpass1' })
  ).token;
  tokens.admin = await adminToken(admin.id);
});

after(async () => {
  server.close();
  for (const url of created) await storage.remove(url.replace(origin, ''));
  await prisma.category.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: ['photos@example.com', 'e2e.photo.courier@sahla.jo', 'e2e.photo.admin@sahla.jo'] } } });
  await prisma.$disconnect();
});

test('a listing photo: GPS removed, at most 1600 px, with a 400 × 400 thumbnail', async () => {
  const original = await photoWithGps();
  assert.ok((await sharp(original).metadata()).exif, 'the test photo has EXIF');

  const response = await upload('/uploads/listing-photo', 'photo', original, tokens.customer);
  assert.equal(response.status, 201);
  const { url } = await response.json();
  created.push(url, url.replace('.jpg', '_400.jpg'));
  assert.match(url, /\/files\/listings\/[0-9a-f-]+\.jpg$/);

  const full = await sharp(await download(url)).metadata();
  assert.equal(full.exif, undefined, 'no EXIF (no GPS) in what buyers download');
  assert.deepEqual([full.width, full.height, full.format], [1600, 800, 'jpeg']);
  const thumb = await sharp(await download(url.replace('.jpg', '_400.jpg'))).metadata();
  assert.deepEqual([thumb.width, thumb.height, thumb.exif], [400, 400, undefined]);
});

test('only real photos, only customers', async () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 7)]);
  const fake = await upload('/uploads/listing-photo', 'photo', pdf, tokens.customer);
  assert.deepEqual([fake.status, (await fake.json()).error.code], [422, 'VALIDATION']);
  const wrongField = await upload('/uploads/listing-photo', 'picture', await photoWithGps(), tokens.customer);
  assert.equal(wrongField.status, 422);
  assert.equal((await upload('/uploads/listing-photo', 'photo', await photoWithGps())).status, 401);
  const courier = await upload('/uploads/listing-photo', 'photo', await photoWithGps(), tokens.courier);
  assert.deepEqual([courier.status, (await courier.json()).error.code], [403, 'FORBIDDEN']);
});

test('avatar: a 512 × 512 picture the profile points to', async () => {
  const response = await upload('/me/avatar', 'avatar', await photoWithGps(), tokens.customer);
  assert.equal(response.status, 200);
  const user = await response.json();
  created.push(user.avatarUrl);
  assert.ok(user.avatarUrl.startsWith(`${origin}/files/avatars/`));
  const image = await sharp(await download(user.avatarUrl)).metadata();
  assert.deepEqual([image.width, image.height, image.exif], [512, 512, undefined]);
});

test('category pictures: admins only; GET /categories shows the new one', async () => {
  const photo = await photoWithGps();
  assert.equal((await upload('/admin/categories/mobiles/image', 'image', photo, tokens.customer, 'PUT')).status, 403);
  assert.equal((await upload('/admin/categories/boats/image', 'image', photo, tokens.admin, 'PUT')).status, 404);

  const response = await upload('/admin/categories/mobiles/image', 'image', photo, tokens.admin, 'PUT');
  assert.equal(response.status, 200);
  const { imageUrl } = await response.json();
  created.push(imageUrl);
  const categories = await (await fetch(`${base}/categories`)).json();
  assert.equal(categories.find((c: { id: string }) => c.id === 'mobiles').imageUrl, imageUrl);
  assert.match(categories.find((c: { id: string }) => c.id === 'kids').imageUrl, /\/static\/categories\/kids\.jpg$/);
  assert.equal((await fetch(imageUrl)).status, 200);
});

test('listing photos no listing used are deleted; avatars and category pictures stay', async () => {
  const response = await upload('/uploads/listing-photo', 'photo', await photoWithGps(), tokens.customer);
  const { url } = await response.json();
  const deleted = await deleteUnusedUploads(-60_000); // "older than a minute from now" = all unused ones
  assert.ok(deleted >= 1);
  assert.equal((await fetch(url)).status, 404);
  assert.equal(await prisma.upload.count({ where: { kind: 'listing' } }), 0);
  assert.equal(await prisma.upload.count({ where: { kind: { in: ['avatar', 'category'] } } }), 2);
});
