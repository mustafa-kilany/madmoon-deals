// POST /auth/google and /auth/apple against a local stand-in for the providers'
// key servers: tokens are signed here exactly like Google / Apple sign them.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

const provider = await generateKeyPair('RS256');
const stranger = await generateKeyPair('RS256'); // a key nobody published
const jwk = { ...(await exportJWK(provider.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const keyServer = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise<void>(resolve => keyServer.listen(0, '127.0.0.1', resolve));
const keysUrl = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}/keys`;
Object.assign(process.env, {
  GOOGLE_JWKS_URL: keysUrl,
  APPLE_JWKS_URL: keysUrl,
  GOOGLE_CLIENT_IDS: 'android-client.apps.googleusercontent.com, ios-client.apps.googleusercontent.com',
  APPLE_CLIENT_IDS: 'jo.sahla.app',
});
// After the settings above: the app reads them when it loads.
const { app } = await import('../../app');
const { prisma } = await import('../../db');
const { createCourier } = await import('../staff/service');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

after(async () => {
  server.close();
  keyServer.close();
  await prisma.user.deleteMany({
    where: {
      OR: [
        { googleId: { not: null } },
        { appleId: { not: null } },
        { email: { in: ['link@example.com', 'e2e.social.courier@sahla.jo'] } },
      ],
    },
  });
  await prisma.$disconnect();
});

const ISSUER = { google: 'https://accounts.google.com', apple: 'https://appleid.apple.com' };
const AUDIENCE = { google: 'android-client.apps.googleusercontent.com', apple: 'jo.sahla.app' };

function idToken(
  who: 'google' | 'apple',
  sub: string,
  claims: JWTPayload & Record<string, unknown> = {},
  options: { key?: CryptoKey; audience?: string; issuer?: string; expires?: string | number } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(options.issuer ?? ISSUER[who])
    .setAudience(options.audience ?? AUDIENCE[who])
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(options.expires ?? '10m')
    .sign(options.key ?? provider.privateKey);
}

async function signIn(who: 'google' | 'apple', token: string, name?: string) {
  const response = await fetch(`${base}/auth/${who}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token, ...(name && { name }) }),
  });
  return { status: response.status, body: await response.json() };
}

test('Google: a new account from the token, the same account next time', async () => {
  const token = await idToken('google', 'g-111', {
    email: 'New.Person@example.com',
    email_verified: true,
    name: 'New Person',
    picture: 'https://lh3.googleusercontent.com/a/photo.jpg',
  });
  const first = await signIn('google', token);
  assert.equal(first.status, 200);
  assert.ok(first.body.token);
  assert.deepEqual(
    [first.body.user.method, first.body.user.email, first.body.user.name, first.body.user.avatarUrl],
    ['google', 'new.person@example.com', 'New Person', 'https://lh3.googleusercontent.com/a/photo.jpg'],
  );
  const again = await signIn('google', await idToken('google', 'g-111', { email: 'new.person@example.com', email_verified: true }));
  assert.equal(again.body.user.id, first.body.user.id);
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${again.body.token}` } });
  assert.equal((await me.json()).id, first.body.user.id);
});

test('a verified email that already has an account is linked, not duplicated', async () => {
  const signup = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Link Me', email: 'link@example.com', password: 'longenough', code: '123456' }),
  });
  const owner = (await signup.json()).user;
  const google = await signIn('google', await idToken('google', 'g-222', { email: 'link@example.com', email_verified: true }));
  assert.equal(google.body.user.id, owner.id);
  assert.equal(google.body.user.method, 'email'); // still signs in with the password too

  // An UNverified email never takes over an existing account.
  const unverified = await signIn('google', await idToken('google', 'g-333', { email: 'link@example.com', email_verified: false }));
  assert.equal(unverified.status, 200);
  assert.notEqual(unverified.body.user.id, owner.id);
  assert.equal(unverified.body.user.email, undefined);
});

test('forged, expired, wrong-app and wrong-provider tokens are refused', async () => {
  const cases = [
    await idToken('google', 'g-x', {}, { key: stranger.privateKey }), // not Google's key
    await idToken('google', 'g-x', {}, { audience: 'someone-elses-app' }), // made for another app
    await idToken('google', 'g-x', {}, { expires: Math.floor(Date.now() / 1000) - 60 }), // expired
    await idToken('apple', 'a-x'), // an Apple token sent to /auth/google
    'not.a.token-at-all-just-some-text',
  ];
  for (const token of cases) {
    const r = await signIn('google', token);
    assert.deepEqual([r.status, r.body.error.code], [401, 'INVALID_CREDENTIALS']);
  }
});

test('Apple: hidden relay emails work; the name can come from the app', async () => {
  const relay = await signIn(
    'apple',
    await idToken('apple', 'a-111', { email: 'x7k2@privaterelay.appleid.com', email_verified: 'true' }),
    'Layla Ahmad',
  );
  assert.deepEqual(
    [relay.status, relay.body.user.method, relay.body.user.email, relay.body.user.name],
    [200, 'apple', 'x7k2@privaterelay.appleid.com', 'Layla Ahmad'],
  );
  const noEmail = await signIn('apple', await idToken('apple', 'a-222'), 'Sami');
  assert.deepEqual([noEmail.status, noEmail.body.user.name, noEmail.body.user.email], [200, 'Sami', undefined]);
  const again = await signIn('apple', await idToken('apple', 'a-222'));
  assert.equal(again.body.user.id, noEmail.body.user.id);
});

test('staff emails can’t sign in or up with Google / Apple', async () => {
  const newStaff = await signIn('google', await idToken('google', 'g-444', { email: 'someone@sahla.jo', email_verified: true }));
  assert.deepEqual([newStaff.status, newStaff.body.error.code], [422, 'VALIDATION']);
  await createCourier({ name: 'E2E Social Courier', email: 'e2e.social.courier@sahla.jo' });
  const courier = await signIn('google', await idToken('google', 'g-555', { email: 'e2e.social.courier@sahla.jo', email_verified: true }));
  assert.deepEqual([courier.status, courier.body.error.code], [403, 'FORBIDDEN']);
});
