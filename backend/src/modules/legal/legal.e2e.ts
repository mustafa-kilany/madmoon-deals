// Privacy policy, terms and consent (BACKEND_PLAN B15.8): public pages from the
// app's own text; sign-up records the accepted version; an existing account
// accepts a new version; no Sanad check without consent.

import { LEGAL_VERSION, SANAD_CONSENT_VERSION } from '@/legal';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app } from '../../app';
import { prisma } from '../../db';

let base = '';
const server = app.listen(0);
const EMAILS = ['legal.one@example.com', 'legal.two@example.com'];

const post = async (path: string, body: unknown, token?: string) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
};

before(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

test('the pages are public, in Arabic (default) and English, with the version', async () => {
  const ar = await fetch(`${base}/legal/privacy`);
  assert.equal(ar.status, 200);
  const html = await ar.text();
  assert.match(html, /dir="rtl"/);
  assert.match(html, /سياسة الخصوصية/);
  assert.ok(html.includes(LEGAL_VERSION));
  const en = await (await fetch(`${base}/legal/terms?lang=en`)).text();
  assert.match(en, /Terms and Conditions/);
  assert.match(en, /escrow/i);
  assert.equal((await fetch(`${base}/legal/cookies`)).status, 422);
  const versions = await (await fetch(`${base}/legal`)).json();
  assert.deepEqual([versions.version, versions.sanadConsentVersion], [LEGAL_VERSION, SANAD_CONSENT_VERSION]);
});

test('sign-up needs the terms accepted and records the version', async () => {
  const body = { name: 'Legal One', email: EMAILS[0], password: 'longenough', code: '123456' };
  const refused = await post('/auth/signup', body);
  assert.deepEqual([refused.status, refused.body.error.code], [422, 'VALIDATION']);
  const ok = await post('/auth/signup', { ...body, acceptTerms: true });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.termsVersion, LEGAL_VERSION);
  const saved = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[0] } });
  assert.ok(saved.termsAcceptedAt);
});

test('an older account accepts the current version; no Sanad check without consent', async () => {
  const { body } = await post('/auth/signup', { name: 'Legal Two', email: EMAILS[1], password: 'longenough', acceptTerms: true, code: '123456' });
  await prisma.user.update({ where: { id: body.user.id }, data: { termsVersion: '2020-01-01' } });
  assert.equal((await post('/me/terms', { version: '2020-01-01' }, body.token)).status, 422);
  const accepted = await post('/me/terms', { version: LEGAL_VERSION }, body.token);
  assert.equal(accepted.body.termsVersion, LEGAL_VERSION);

  // Without consent: refused before Sanad is even asked (SANAD_MODE is fake in tests).
  assert.equal((await post('/me/id-verification/sanad', {}, body.token)).status, 422);
  const started = await post('/me/id-verification/sanad', { consent: true }, body.token);
  assert.equal(started.status, 200);
  const check = await prisma.idVerification.findFirstOrThrow({ where: { userId: body.user.id } });
  assert.equal(check.consentVersion, SANAD_CONSENT_VERSION);
  assert.ok(check.consentAt);
});
