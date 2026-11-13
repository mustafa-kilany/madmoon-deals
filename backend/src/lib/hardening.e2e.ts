// Hardening checks from SECURITY_PLAN: S1.2 common passwords are refused;
// S4.2 a small file claiming a huge picture (decompression bomb) is refused from
// its header; S4.3 an SVG named .jpg is refused (the type comes from the bytes).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { app } from '../app';
import { prisma } from '../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['hardening@example.com', 'hardening.weak@example.com'];
let token = '';

const signup = (email: string, password: string) =>
  fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hard Ening', email, password, acceptTerms: true, code: '123456' }),
  });

/** A PNG whose header claims width × height, with almost no pixel data. */
function claimedPng(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0${'x'.repeat(1200)}`)), // past the 1 KB minimum
    chunk('IDAT', deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const upload = (bytes: Buffer, name: string, type: string) => {
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(bytes)], { type }), name);
  return fetch(`${base}/uploads/listing-photo`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  token = (await (await signup(EMAILS[0], 'a long and odd passphrase')).json()).token;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('S1.2 a common password is refused at sign-up', async () => {
  for (const weak of ['password123', 'Password123', '12345678', 'sahla1234']) {
    const r = await signup(EMAILS[1], weak);
    assert.equal(r.status, 422, weak);
    assert.match((await r.json()).error.message, /too common/);
  }
});

test('S4.2 a decompression bomb is refused from its header', async () => {
  // 64 MP: under sharp's own limit (268 MP), over ours (40 MP); 20 000 × 20 000 is refused by sharp itself.
  const r = await upload(claimedPng(8000, 8000), 'bomb.png', 'image/png');
  assert.equal(r.status, 422);
  assert.match((await r.json()).error.message, /too many pixels/);
});

test('S4.3 an SVG named .jpg is not an image we take', async () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">${' '.repeat(1100)}</svg>`);
  const r = await upload(svg, 'cat.jpg', 'image/jpeg');
  assert.equal(r.status, 422);
});

test('F3 broken input is a 4xx, never a 500', async () => {
  const send = (path: string, init?: RequestInit) => fetch(base + path, init);
  const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const [path, init] of [
    ['/listings/%00', undefined],
    ['/listings/%E0%A4%A', undefined],
    ['/listings?q=%00', undefined],
    ['/auth/login', json('POST', { email: 'a@b.co', password: 'pass\u0000word' })],
    ['/auth/login', json('POST', { 'em\u0000ail': 'x' })],
    ['/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' }],
    ['/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `${'['.repeat(30_000)}${']'.repeat(30_000)}` }],
    ['/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `${'{"a":'.repeat(10_000)}1${'}'.repeat(10_000)}` }],
    ['/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x'.repeat(100_000) }) }],
  ] as [string, RequestInit | undefined][]) {
    const r = await send(path, init);
    assert.ok(r.status >= 400 && r.status < 500, `${path} → ${r.status}`);
    assert.ok(!(await r.text()).includes('stack'), path);
  }
});

test('a broken query string is harmless', async () => {
  const r = await fetch(`${base}/listings?q=%E0%A4%A`);
  assert.ok(r.status < 500, String(r.status));
});
