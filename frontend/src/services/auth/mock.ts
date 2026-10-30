// Accounts answered by the mock backend. It behaves like the real API:
// accounts and sessions persist on the device, the token is read the way a
// server reads the Authorization header, and failures throw the contract's
// error codes.

import type { Session, User } from '@/lib/types';
import { ApiError } from '../api/errors';
import { tokenStorage } from '../api/tokenStorage';
import { mockLatency, readMockTable, writeMockTable } from '../mock/delay';
import {
  avatarOptions,
  courierAccount,
  demoAccount,
  type MockAccount,
} from '../mock/users';
import type { AuthService } from './types';

const USERS = 'users'; // id → MockAccount
const SESSIONS = 'sessions'; // token → user id
const DELETED = 'deleted'; // id → true (keeps deleted demo accounts gone)

function users(): Record<string, MockAccount> {
  const table = readMockTable<MockAccount>(USERS);
  const deleted = readMockTable<boolean>(DELETED);
  for (const seed of [demoAccount, courierAccount])
    if (!table[seed.id] && !deleted[seed.id]) table[seed.id] = seed;
  return table;
}

const saveUser = (account: MockAccount) =>
  writeMockTable(USERS, { ...users(), [account.id]: account });

const publicUser = ({ password: _password, ...user }: MockAccount): User =>
  user;

const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function openSession(account: MockAccount): Session {
  const token = `mock-${newId()}`;
  writeMockTable(SESSIONS, {
    ...readMockTable<string>(SESSIONS),
    [token]: account.id,
  });
  return { token, user: publicUser(account) };
}

/** The account behind the current token, like an authenticated endpoint. */
function currentAccount(): MockAccount {
  const token = tokenStorage.get();
  const userId = token ? readMockTable<string>(SESSIONS)[token] : undefined;
  const account = userId ? users()[userId] : undefined;
  if (!account) throw new ApiError('UNAUTHORIZED', 'Not signed in', 401);
  return account;
}

const update = (patch: Partial<MockAccount>): User => {
  const account = { ...currentAccount(), ...patch };
  saveUser(account);
  return publicUser(account);
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The mock "emails" this code for sign-up and password reset. */
export const MOCK_CODE = '123456';

const checkCode = (code: string) => {
  if (code.trim() !== MOCK_CODE)
    throw new ApiError('INVALID_CODE', 'Wrong or expired code', 422);
};

export const mockAuthService: AuthService = {
  signUpWithEmail: async ({ name, email, password, code }) => {
    await mockLatency();
    const address = normalizeEmail(email);
    if (Object.values(users()).some(u => u.email === address))
      throw new ApiError('EMAIL_TAKEN', 'Email already registered', 409);
    checkCode(code);
    const account: MockAccount = {
      id: `user-${newId()}`,
      name: name.trim(),
      email: address,
      password,
      method: 'email',
      verified: false,
      cityId: 'amman',
      avatarUrl: avatarOptions[0],
    };
    saveUser(account);
    return openSession(account);
  },

  logInWithEmail: async ({ email, password }) => {
    await mockLatency();
    const address = normalizeEmail(email);
    const account = Object.values(users()).find(u => u.email === address);
    if (!account || account.password !== password)
      throw new ApiError('INVALID_CREDENTIALS', 'Wrong email or password', 401);
    return openSession(account);
  },

  logInWithGoogle: async () => {
    await mockLatency();
    const email = 'google.user@gmail.com';
    let account = Object.values(users()).find(u => u.email === email);
    if (!account) {
      account = {
        id: `user-${newId()}`,
        name: 'Google User',
        email,
        method: 'google',
        verified: false,
        cityId: 'amman',
        avatarUrl: avatarOptions[0],
      };
      saveUser(account);
    }
    return openSession(account);
  },

  logInWithApple: async () => {
    await mockLatency();
    const email = 'user@apple.com';
    let account = Object.values(users()).find(u => u.email === email);
    if (!account) {
      account = {
        id: `user-${newId()}`,
        name: 'Apple User',
        email,
        method: 'apple',
        verified: false,
        cityId: 'amman',
        avatarUrl: avatarOptions[0],
      };
      saveUser(account);
    }
    return openSession(account);
  },

  sendOtp: async ({ email }) => {
    await mockLatency();
    if (Object.values(users()).some(u => u.email === normalizeEmail(email)))
      throw new ApiError('EMAIL_TAKEN', 'Email already registered', 409);
    // Mock: nothing is sent; the code is always MOCK_CODE.
  },

  forgotPassword: async () => {
    await mockLatency();
    // Mock: nothing is sent; the code is always MOCK_CODE.
  },

  resetPassword: async ({ email, code, password }) => {
    await mockLatency();
    checkCode(code);
    const account = Object.values(users()).find(
      u => u.email === normalizeEmail(email),
    );
    if (!account)
      throw new ApiError('INVALID_CODE', 'Wrong or expired code', 422);
    if (password.length < 8)
      throw new ApiError('VALIDATION', 'password: at least 8 characters', 422);
    const updated = { ...account, password };
    saveUser(updated);
    // Every other session ends: the old password may have leaked.
    writeMockTable(
      SESSIONS,
      Object.fromEntries(
        Object.entries(readMockTable<string>(SESSIONS)).filter(
          ([, id]) => id !== account.id,
        ),
      ),
    );
    return openSession(updated);
  },

  // Like the server until Sahla has Sanad access.
  startIdVerification: async () => {
    await mockLatency();
    currentAccount();
    throw new ApiError(
      'SANAD_UNAVAILABLE',
      'ID verification with Sanad is coming soon',
      503,
    );
  },

  getMe: async () => {
    await mockLatency();
    return publicUser(currentAccount());
  },

  updateProfile: async patch => {
    await mockLatency();
    return update(patch);
  },

  // The mock "stores" the photo where it already is on the device.
  changeAvatar: async photo => {
    await mockLatency();
    return update({ avatarUrl: photo.uri });
  },

  savePaymentCard: async cardToken => {
    await mockLatency();
    // Mock tokens are "mock_<brand>_<last4>" (services/payments).
    const [, brand = 'card', last4 = '0000'] = cardToken.split('_');
    return update({ card: { brand, last4 } });
  },

  removePaymentCard: async () => {
    await mockLatency();
    return update({ card: undefined });
  },

  deleteAccount: async () => {
    await mockLatency();
    const account = currentAccount();
    const table = users();
    delete table[account.id];
    writeMockTable(USERS, table);
    writeMockTable(DELETED, {
      ...readMockTable<boolean>(DELETED),
      [account.id]: true,
    });
    writeMockTable(
      SESSIONS,
      Object.fromEntries(
        Object.entries(readMockTable<string>(SESSIONS)).filter(
          ([, id]) => id !== account.id,
        ),
      ),
    );
  },

  logOut: async () => {
    await mockLatency();
    const token = tokenStorage.get();
    if (!token) return;
    const sessions = readMockTable<string>(SESSIONS);
    delete sessions[token];
    writeMockTable(SESSIONS, sessions);
  },
};
