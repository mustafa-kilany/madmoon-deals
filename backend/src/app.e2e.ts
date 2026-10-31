// Production settings (BACKEND_PLAN B12.1): security headers on every answer.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from './app';
import { prisma } from './db';

let base = '';
const server = app.listen(0);
before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('security headers; photos can be loaded by the app', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('strict-transport-security') ?? '', /max-age=/);
  assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'cross-origin');
});
