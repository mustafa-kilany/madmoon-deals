// Production settings and CORS (SECURITY_PLAN S0.4, S0.8): the server refuses to
// start in production with unsafe settings; only the dashboard's own origin gets
// CORS headers, and only on /v1/admin.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

const ADMIN_ORIGIN = 'https://admin.sahla.example';
process.env.ADMIN_ORIGIN = ADMIN_ORIGIN; // before the app reads its settings
let base = '';
let server: Server;
let disconnect: () => Promise<void>;

before(async () => {
  const { app } = await import('../app');
  const { prisma } = await import('../db');
  disconnect = () => prisma.$disconnect();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(async () => {
  server.close();
  await disconnect();
});

const GOOD_1 = 'kW3vN8pQzR1xT6yU9aB2cD5eF7gH0jL4mS';
const GOOD_2 = 'Zq9Xw2Ev7Rt4Yu1Io6Pa3Sd8Fg5Hj0Kl';

/** Starts the settings check alone with these variables; its exit code and output. */
function startWith(vars: Record<string, string>) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', "import('./src/env.ts').then(() => console.log('started'))"], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: GOOD_1, ID_HASH_SECRET: GOOD_2, PUBLIC_URL: 'https://api.sahla.jo', RATE_LIMIT_MULTIPLIER: '1', DEV_EMAIL_CODE: '', MAIL_MODE: 'postmark', POSTMARK_SERVER_TOKEN: 'x', SANAD_MODE: 'off', PAYMENT_MODE: 'off', GEOCODER: 'off', ADMIN_2FA: 'on', ...vars },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('S0.4 production needs an https PUBLIC_URL', () => {
  const missing = startWith({ PUBLIC_URL: '' });
  assert.equal(missing.code, 1);
  assert.match(missing.out, /PUBLIC_URL/);
  assert.equal(startWith({ PUBLIC_URL: 'http://api.sahla.jo' }).code, 1);
  const ok = startWith({ PUBLIC_URL: 'https://api.sahla.jo' });
  assert.match(ok.out, /started/);
});

test('S1.1 production refuses weak or missing secrets', () => {
  for (const [vars, setting] of [
    [{ JWT_SECRET: 'ci-only-secret-not-used-anywhere-else-0123456789' }, 'JWT_SECRET'], // a placeholder
    [{ JWT_SECRET: 'a'.repeat(64) }, 'JWT_SECRET'], // long, but not random
    [{ JWT_SECRET: 'short' }, 'JWT_SECRET'],
    [{ ID_HASH_SECRET: '' }, 'ID_HASH_SECRET'],
    [{ ID_HASH_SECRET: GOOD_1 }, 'ID_HASH_SECRET'], // the same as JWT_SECRET
  ] as const) {
    const r = startWith(vars);
    assert.equal(r.code, 1, JSON.stringify(vars));
    assert.match(r.out, new RegExp(setting));
  }
  assert.match(startWith({}).out, /started/);
});

test('S0.8 CORS: only the dashboard origin, only on /v1/admin', async () => {
  const preflight = (origin: string, path = '/admin/me') =>
    fetch(base + path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });

  const ours = await preflight(ADMIN_ORIGIN);
  assert.equal(ours.status, 204);
  assert.equal(ours.headers.get('access-control-allow-origin'), ADMIN_ORIGIN);
  assert.match(ours.headers.get('access-control-allow-headers') ?? '', /Authorization/);

  const evil = await fetch(`${base}/admin/me`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  // The app's endpoints never send CORS headers (the phone app needs none).
  const app = await fetch(`${base}/categories`, { headers: { Origin: ADMIN_ORIGIN } });
  assert.equal(app.headers.get('access-control-allow-origin'), null);
});
