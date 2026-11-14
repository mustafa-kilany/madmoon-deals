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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'madmoon-contract-'));
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
    code: '123456',
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
      code: '123456',
    }),
  );
  expect([invalid.code, invalid.status]).toEqual(['VALIDATION', 422]);
  const taken = await failure(
    api.signUpWithEmail({
      name: 'Lina',
      email: 'lina@example.com',
      password: 'x'.repeat(8),
      code: '123456',
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
    code: '123456',
  });
  tokenStorage.set(token);

  expect((await api.updateProfile({ cityId: 'irbid' })).cityId).toBe('irbid');
  expect((await failure(api.updateProfile({ cityId: 'paris' }))).code).toBe(
    'VALIDATION',
  );

  // Upload checks the real bytes: a renamed PDF is rejected.
  expect((await failure(api.changeAvatar(notAPhoto))).code).toBe('VALIDATION');

  const avatar = (await api.changeAvatar(jpeg)).avatarUrl;
  expect(avatar).toMatch(/\/uploads\/.+\.jpg$/);
  expect((await fetch(avatar)).status).toBe(200); // the stored photo is served

  expect((await api.savePaymentCard('mock_visa_1234')).card).toEqual({
    brand: 'visa',
    last4: '1234',
  });
  expect((await api.removePaymentCard()).card).toBeUndefined();

  expect(
    log.some(l => /POST \/v1\/me\/avatar -> 200 .*upload jpg/.test(l)),
  ).toBe(true);
});

test('ID verification is Sanad only, and not switched on yet', async () => {
  const { token } = await api.logInWithEmail({
    email: 'ahmad@sahla.jo',
    password: 'sahla1234',
  });
  tokenStorage.set(token);
  const refused = await failure(api.startIdVerification());
  expect([refused.code, refused.status]).toEqual(['SANAD_UNAVAILABLE', 503]);
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
  expect((await failure(api.startIdVerification())).code).toBe('UNAUTHORIZED');
});

test('sign-up needs the emailed code; send-otp refuses a taken email', async () => {
  const wrong = await failure(
    api.signUpWithEmail({
      name: 'Rami',
      email: 'rami@sahla.jo',
      password: 'longenough',
      code: '000000',
    }),
  );
  expect([wrong.code, wrong.status]).toEqual(['INVALID_CODE', 422]);
  await api.sendOtp({ email: 'rami@sahla.jo' });
  // S1.3: the same answer for an email that has an account.
  await api.sendOtp({ email: 'ahmad@sahla.jo' });
});

test('password reset: code + new password signs in and ends old sessions', async () => {
  await api.signUpWithEmail({
    name: 'Huda',
    email: 'huda@sahla.jo',
    password: 'oldpassword',
    code: '123456',
  });
  const old = await api.logInWithEmail({
    email: 'huda@sahla.jo',
    password: 'oldpassword',
  });
  // Same answer whether or not the account exists.
  await api.forgotPassword({ email: 'huda@sahla.jo' });
  await api.forgotPassword({ email: 'nobody@sahla.jo' });

  const wrong = await failure(
    api.resetPassword({
      email: 'huda@sahla.jo',
      code: '999999',
      password: 'newpassword',
    }),
  );
  expect(wrong.code).toBe('INVALID_CODE');

  const session = await api.resetPassword({
    email: 'huda@sahla.jo',
    code: '123456',
    password: 'newpassword',
  });
  expect(session.user.email).toBe('huda@sahla.jo');
  expect(
    (
      await failure(
        api.logInWithEmail({ email: 'huda@sahla.jo', password: 'oldpassword' }),
      )
    ).code,
  ).toBe('INVALID_CREDENTIALS');
  await api.logInWithEmail({ email: 'huda@sahla.jo', password: 'newpassword' });

  tokenStorage.set(old.token);
  expect((await failure(api.getMe())).code).toBe('UNAUTHORIZED');
});

test('delete account: the token stops working and the email is free again', async () => {
  const { token } = await api.signUpWithEmail({
    name: 'Tala',
    email: 'tala@sahla.jo',
    password: 'longenough',
    code: '123456',
  });
  tokenStorage.set(token);
  await api.deleteAccount();
  tokenStorage.set(token);
  expect((await failure(api.getMe())).code).toBe('UNAUTHORIZED');
  expect(
    (
      await failure(
        api.logInWithEmail({ email: 'tala@sahla.jo', password: 'longenough' }),
      )
    ).code,
  ).toBe('INVALID_CREDENTIALS');
  await api.sendOtp({ email: 'tala@sahla.jo' });
});
