// BACKEND_REVIEW M3: an app build older than MIN_APP_BUILD is told to update, on every endpoint,
// before anything else answers; newer builds and callers that aren't the app are untouched.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../db';
import { env } from '../env';
import { startApi } from './testkit';

const api = startApi();
const settings = env as { MIN_APP_BUILD?: number };
const asBuild = (build: string | undefined, path = '/categories', init: RequestInit = {}) =>
  api.raw(path, { ...init, headers: { ...(build !== undefined && { 'X-App-Build': build }), ...init.headers } });

before(() => api.ready);
after(async () => {
  settings.MIN_APP_BUILD = undefined;
  api.close();
  await prisma.$disconnect();
});

test('with no minimum set, every build is answered', async () => {
  settings.MIN_APP_BUILD = undefined;
  assert.equal((await asBuild('1')).status, 200);
});

test('a build older than the minimum gets 426 UPDATE_REQUIRED, on reads, writes and sign-in alike', async () => {
  settings.MIN_APP_BUILD = 5;
  for (const [path, init] of [
    ['/categories', {}],
    ['/me', {}],
    ['/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"x@example.com","password":"wrong-password"}' }],
  ] as const) {
    const r = await asBuild('4', path, init);
    assert.equal(r.status, 426, path);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'UPDATE_REQUIRED');
  }
});

test('the minimum build and newer ones are answered as usual', async () => {
  settings.MIN_APP_BUILD = 5;
  assert.equal((await asBuild('5')).status, 200);
  assert.equal((await asBuild('12')).status, 200);
  assert.equal((await asBuild('5', '/me')).status, 401, 'past the build check, the normal checks still apply');
});

test('callers that are not the app, or send nonsense, are not stopped by it', async () => {
  settings.MIN_APP_BUILD = 5;
  assert.equal((await asBuild(undefined)).status, 200);
  assert.equal((await asBuild('abc')).status, 200);
  assert.equal((await asBuild('-1')).status, 200);
});
