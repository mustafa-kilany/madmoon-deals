/* eslint-env jest, node */
/* global globalThis */
// End-to-end over real HTTP: the app's HTTP services (services/auth/http.ts
// + services/api/client.ts) against the contract server
// (tools/contract-server), which implements docs/API.md. No mocks between
// the app code and the socket except how React Native reads a photo file.
// (Plain JS: it needs Node's fs/net types, which the app's TS setup omits.)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '@/config';
import { setUnauthorizedHandler } from '@/services/api/client';
import { tokenStorage } from '@/services/api/tokenStorage';
import { httpAuthService as api } from '@/services/auth/http';

const { createContractServer } = require('../tools/contract-server/server');

jest.mock('@/config', () => ({
  config: { apiBaseUrl: '', requestTimeoutMs: 5000, uploadTimeoutMs: 5000 },
}));

// React Native's FormData uploads a { uri, type, name } part by reading the
// file; Node's FormData needs a Blob. Do what React Native does.
class RNFormData extends FormData {
  append(name, value) {
    if (value && typeof value === 'object' && value.uri)
      super.append(
        name,
        new Blob([fs.readFileSync(value.uri)], { type: value.type }),
        value.name,
      );
    else super.append(name, value);
  }
}
globalThis.FormData = RNFormData;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sahla-contract-'));
function photoFile(name, header) {
  const file = path.join(tmp, name);
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from(header), Buffer.alloc(4096, 7)]),
  );
  return { uri: file, mimeType: 'image/jpeg', fileName: name };
}
const jpeg = photoFile('id.jpg', [0xff, 0xd8, 0xff, 0xe0]);
const notAPhoto = photoFile('fake.jpg', [0x25, 0x50, 0x44, 0x46]); // "%PDF"

/** The ApiError a request fails with (fails the test if it succeeds). */
const failure = request =>
  request.then(
    () => {
      throw new Error('expected the request to fail');
    },
    error => error,
  );

const log = [];
let server;
const signedOut = jest.fn();

beforeAll(async () => {
  server = createContractServer({ log: line => log.push(line) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config.apiBaseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  setUnauthorizedHandler(signedOut);
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  tokenStorage.clear();
  signedOut.mockClear();
});

test('email sign-up → session; bad input → VALIDATION; duplicate → EMAIL_TAKEN', async () => {
  const session = await api.signUpWithEmail({
    name: 'Lina',
    email: 'Lina@Example.com',
    password: 'longenough',
  });
  expect(session.token.length).toBeGreaterThan(20);
  expect(session.user).toMatchObject({
    name: 'Lina',
    email: 'lina@example.com',
    method: 'email',
    verified: false,
  });
  expect(session.user).not.toHaveProperty('passwordHash');

  const invalid = await failure(
    api.signUpWithEmail({
      name: 'L',
      email: 'new@example.com',
      password: 'x'.repeat(8),
    }),
  );
  expect([invalid.code, invalid.status]).toEqual(['VALIDATION', 422]);
  const taken = await failure(
    api.signUpWithEmail({
      name: 'Lina',
      email: 'lina@example.com',
      password: 'x'.repeat(8),
    }),
  );
  expect([taken.code, taken.status]).toEqual(['EMAIL_TAKEN', 409]);
});

test('log-in: wrong password is INVALID_CREDENTIALS and does not sign anyone out', async () => {
  const wrong = await failure(
    api.logInWithEmail({ email: 'ahmad@sahla.jo', password: 'nope' }),
  );
  expect([wrong.code, wrong.status]).toEqual(['INVALID_CREDENTIALS', 401]);
  expect(signedOut).not.toHaveBeenCalled();

  const { token, user } = await api.logInWithEmail({
    email: ' AHMAD@sahla.jo ',
    password: 'sahla1234',
  });
  expect(user).toMatchObject({ name: 'Ahmad', card: { last4: '4242' } });
  tokenStorage.set(token);
  expect((await api.getMe()).email).toBe('ahmad@sahla.jo');
});

test('profile, ID verification upload and card, with the session token', async () => {
  const { token } = await api.signUpWithEmail({
    name: 'Omar',
    email: 'omar@sahla.jo',
    password: 'longenough',
  });
  tokenStorage.set(token);

  expect((await api.updateProfile({ cityId: 'irbid' })).cityId).toBe('irbid');
  expect((await failure(api.updateProfile({ cityId: 'paris' }))).code).toBe(
    'VALIDATION',
  );

  // Upload checks the real bytes: a renamed PDF is rejected.
  expect((await failure(api.verifyId(notAPhoto))).code).toBe('VALIDATION');
  expect((await api.verifyId(jpeg)).verified).toBe(true);

  const avatar = (await api.changeAvatar(jpeg)).avatarUrl;
  expect(avatar).toMatch(/\/uploads\/.+\.jpg$/);
  expect((await fetch(avatar)).status).toBe(200); // the stored photo is served

  expect((await api.savePaymentCard('mock_visa_1234')).card).toEqual({
    brand: 'visa',
    last4: '1234',
  });
  expect((await api.removePaymentCard()).card).toBeUndefined();

  expect(
    log.some(l => /POST \/v1\/me\/id-verification -> 200 .*upload jpg/.test(l)),
  ).toBe(true);
});

test('ID verification upgrades an email account to verified', async () => {
  const { token } = await api.logInWithEmail({
    email: 'ahmad@sahla.jo',
    password: 'sahla1234',
  });
  tokenStorage.set(token);
  expect((await api.verifyId(jpeg)).verified).toBe(true);
});

test('log-out revokes the token; using it again signs the app out', async () => {
  const { token } = await api.logInWithEmail({
    email: 'ahmad@sahla.jo',
    password: 'sahla1234',
  });
  tokenStorage.set(token);
  await api.logOut();
  const after = await failure(api.getMe());
  expect([after.code, after.status]).toEqual(['UNAUTHORIZED', 401]);
  expect(signedOut).toHaveBeenCalledTimes(1);
});

test('calls without a token are refused', async () => {
  expect((await failure(api.getMe())).code).toBe('UNAUTHORIZED');
  expect((await failure(api.verifyId(jpeg))).code).toBe('UNAUTHORIZED');
});
