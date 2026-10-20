// The mock backend must behave like the real API will (docs/API.md), so
// screens built against it keep working when the backend is connected.

import { ApiError } from '@/services/api/errors';
import { tokenStorage } from '@/services/api/tokenStorage';
import { mockAuthService as auth } from '@/services/auth/mock';
import { mockDb } from '@/services/mock/delay';
import { paymentProvider } from '@/services/payments';

jest.mock('@/config', () => ({
  config: { mockLatencyMs: 0, mock: { auth: true, catalog: true } },
}));

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

beforeEach(() => {
  mockDb.clearAll();
  tokenStorage.clear();
});

test('email sign-up creates an unverified account and a session', async () => {
  const session = await auth.signUpWithEmail({
    name: ' Lina ',
    email: 'Lina@Example.com',
    password: 'longenough',
  });
  expect(session.token).toBeTruthy();
  expect(session.user).toMatchObject({
    name: 'Lina',
    email: 'lina@example.com',
    method: 'email',
    verified: false,
  });
  expect(session.user).not.toHaveProperty('password');
});

test('the same email cannot sign up twice', async () => {
  const input = { name: 'A', email: 'a@b.co', password: 'longenough' };
  await auth.signUpWithEmail(input);
  expect(await code(auth.signUpWithEmail(input))).toBe('EMAIL_TAKEN');
});

test('log-in checks the password; the demo account works', async () => {
  expect(
    await code(
      auth.logInWithEmail({ email: 'ahmad@sahla.jo', password: 'nope' }),
    ),
  ).toBe('INVALID_CREDENTIALS');
  const session = await auth.logInWithEmail({
    email: 'AHMAD@sahla.jo',
    password: 'sahla1234',
  });
  expect(session.user.name).toBe('Ahmad');
  expect(session.user.card?.last4).toBe('4242');
});

test('authenticated calls need a valid token', async () => {
  expect(await code(auth.getMe())).toBe('UNAUTHORIZED');
  const session = await auth.signUpWithEmail({
    name: 'Sara',
    email: 'sara@x.jo',
    password: 'longenough',
  });
  tokenStorage.set(session.token);
  expect((await auth.getMe()).verified).toBe(false);
  expect(
    (
      await auth.verifyId({
        uri: 'x',
        mimeType: 'image/jpeg',
        fileName: 'id.jpg',
      })
    ).verified,
  ).toBe(true);
  await auth.logOut();
  expect(await code(auth.getMe())).toBe('UNAUTHORIZED');
});

test('profile changes persist on the account', async () => {
  const { token } = await auth.signUpWithEmail({
    name: 'Omar',
    email: 'omar@x.jo',
    password: 'longenough',
  });
  tokenStorage.set(token);
  await auth.updateProfile({ cityId: 'irbid' });
  await auth.verifyId({ uri: 'x', mimeType: 'image/jpeg', fileName: 'id.jpg' });
  await auth.savePaymentCard(
    await paymentProvider.tokenizeCard('4111 1111 1111 1234'),
  );
  expect(await auth.getMe()).toMatchObject({
    cityId: 'irbid',
    verified: true,
    card: { brand: 'visa', last4: '1234' },
  });
  expect((await auth.removePaymentCard()).card).toBeUndefined();
});

test('the payment mock never keeps more than the last 4 digits', async () => {
  const token = await paymentProvider.tokenizeCard('5555 4444 3333 1111');
  expect(token).toBe('mock_mastercard_1111');
  await expect(paymentProvider.tokenizeCard('123')).rejects.toThrow();
});
