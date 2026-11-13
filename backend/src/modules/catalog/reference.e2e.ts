import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('GET /categories: the 8 categories with image URLs this server serves', async () => {
  const categories = await (await fetch(`${base}/v1/categories`)).json();
  assert.deepEqual(
    categories.map((c: { id: string }) => c.id),
    ['mobiles', 'electronics', 'vehicles', 'furniture', 'appliances', 'fashion', 'kids', 'hobbies'],
  );
  assert.deepEqual(Object.keys(categories[0]).sort(), ['icon', 'id', 'imageUrl', 'name']);
  assert.equal(categories[0].name.ar, 'موبايلات وتابلت');
  const image = await fetch(categories[0].imageUrl);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type') ?? '', /image\/jpeg/);
});

test('GET /categories/filters: types, brands, models, certificate switch', async () => {
  const filters = await (await fetch(`${base}/v1/categories/filters`)).json();
  const phones = filters.mobiles.types.find((t: { id: string }) => t.id === 'phones');
  assert.equal(phones.requiresTestCertificate, true);
  assert.ok(phones.brands.includes('Apple'));
  assert.ok(phones.models.Apple.includes('iPhone 14 Pro'));
  assert.ok(filters.mobiles.brands.length > 10);
  const fridges = filters.appliances.types.find((t: { id: string }) => t.id === 'fridges');
  assert.equal(fridges.requiresTestCertificate, undefined);
});

test('GET /cities: 170 areas with governorate and centre', async () => {
  const response = await fetch(`${base}/v1/cities`);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  const cities = await response.json();
  assert.equal(cities.length, 170);
  const salt = cities.find((c: { id: string }) => c.id === 'salt');
  assert.deepEqual(salt.governorate, { ar: 'البلقاء', en: 'Balqa' });
  assert.equal(typeof salt.lat, 'number');
});
